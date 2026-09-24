// ==UserScript==
// @name         Google Flow Live Sync & Generation Bridge
// @namespace    https://flow.google.com/
// @version      2.1.0
// @description  Двусторонняя синхронизация файлов и проброс генерации изображений между Google Flow и локальным ПК
// @author       Antigravity
// @match        *://flow.google.com/*
// @match        *://*.flow.google.com/*
// @match        *://labs.google/*
// @match        *://*.labs.google/*
// @match        *://*.google.com/*
// @match        *://*.scf.usercontent.goog/*
// @match        *://*.usercontent.goog/*
// @include      *://flow.google.com/*
// @include      *://*.flow.google.com/*
// @include      *://labs.google/fx/tools/flow*
// @include      *://*.scf.usercontent.goog/*
// @allFrames    true
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const isIframe = window.top !== window.self;
    const isFlowHost = window.location.host.includes('flow.google') || window.location.host.includes('labs.google');
    const isUserContent = window.location.host.includes('usercontent.goog');

    if (!isFlowHost && !isUserContent) {
        return;
    }

    // ----------------------------------------------------
    // 1. IFRAME CONTEXT (runs inside *.scf.usercontent.goog)
    // ----------------------------------------------------
    if (isIframe) {
        // Listen for postMessage from Flow host
        window.addEventListener('message', async (event) => {
            if (event.data && event.data.type === 'FLOW_BRIDGE_GENERATE') {
                const { id, prompt, aspectRatio, modelDisplayName } = event.data;
                console.log(`[FlowRunnerIframe] Received generate request: "${prompt}"`);

                try {
                    // Check if Flow SDK is available in the iframe context
                    const flowObj = window.Flow || (window.parent && window.parent.Flow);
                    if (!flowObj || !flowObj.generate || !flowObj.generate.image) {
                        throw new Error('Flow.generate.image недоступен в текущем контексте фрейма.');
                    }

                    const result = await flowObj.generate.image({
                        prompt: prompt,
                        aspectRatio: aspectRatio || '1:1',
                        modelDisplayName: modelDisplayName || '🍌 Nano Banana Pro'
                    });

                    window.parent.postMessage({
                        type: 'FLOW_BRIDGE_GENERATE_RESULT',
                        id: id,
                        status: 'success',
                        mediaId: result.mediaId,
                        base64: result.base64,
                        mimeType: result.mimeType || 'image/png'
                    }, '*');
                } catch (err) {
                    console.error('[FlowRunnerIframe] Error:', err);
                    window.parent.postMessage({
                        type: 'FLOW_BRIDGE_GENERATE_RESULT',
                        id: id,
                        status: 'error',
                        error: err.message
                    }, '*');
                }
            }
        });
        return;
    }

    // ----------------------------------------------------
    // 2. HOST CONTEXT (runs inside flow.google.com)
    // ----------------------------------------------------
    const BRIDGE_HTTP = 'http://127.0.0.1:3210';
    const BRIDGE_WS = 'ws://127.0.0.1:3210/ws?role=flow_tab';

    let ws = null;
    let autoSyncEnabled = true;
    let isConnected = false;
    let isPulling = false;
    let lastGeneratedBase64 = null;
    const pendingGenerations = new Map();

    const CSS_STYLES = `
        #flow-sync-widget {
            position: fixed !important;
            top: 65px !important;
            right: 20px !important;
            width: 295px !important;
            background: #13131a !important;
            color: #f1f1f1 !important;
            border: 1px solid #3b3b55 !important;
            border-radius: 12px !important;
            box-shadow: 0 12px 36px rgba(0,0,0,0.75) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 12px !important;
            line-height: 1.4 !important;
            user-select: none !important;
            box-sizing: border-box !important;
        }
        #flow-sync-widget * { box-sizing: border-box !important; }
        .fs-header {
            display: flex !important;
            align-items: center !important;
            padding: 10px 14px !important;
            background: #0d0d12 !important;
            border-top-left-radius: 11px !important;
            border-top-right-radius: 11px !important;
            border-bottom: 1px solid #2a2a3e !important;
            cursor: move !important;
        }
        .fs-dot {
            width: 10px !important;
            height: 10px !important;
            border-radius: 50% !important;
            background: #ef4444 !important;
            margin-right: 8px !important;
            display: inline-block !important;
            box-shadow: 0 0 8px #ef4444 !important;
        }
        .fs-dot.connected {
            background: #10b981 !important;
            box-shadow: 0 0 10px #10b981 !important;
        }
        .fs-title {
            font-weight: 700 !important;
            color: #fff !important;
            flex-grow: 1 !important;
            font-size: 12px !important;
        }
        .fs-badge {
            background: #312e81 !important;
            color: #a5b4fc !important;
            font-size: 10px !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            margin-right: 6px !important;
            font-weight: 600 !important;
        }
        .fs-toggle-btn {
            background: none !important;
            border: none !important;
            color: #888 !important;
            cursor: pointer !important;
            font-size: 16px !important;
            padding: 0 4px !important;
            line-height: 1 !important;
        }
        .fs-toggle-btn:hover { color: #fff !important; }
        .fs-body {
            padding: 12px 14px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
        }
        .fs-status { font-size: 11px !important; color: #a0a0b8 !important; font-weight: 500 !important; }
        .fs-controls { display: flex !important; flex-direction: column !important; gap: 6px !important; }
        .fs-btn {
            padding: 8px 10px !important;
            border-radius: 6px !important;
            border: none !important;
            font-weight: 600 !important;
            font-size: 11px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
            transition: all 0.15s !important;
        }
        .fs-btn-primary { background: #6366f1 !important; color: #ffffff !important; }
        .fs-btn-primary:hover { background: #4f46e5 !important; }
        .fs-btn-secondary {
            background: #232332 !important;
            color: #e0e0e0 !important;
            border: 1px solid #3d3d55 !important;
        }
        .fs-btn-secondary:hover { background: #2f2f44 !important; color: #fff !important; }
        .fs-switch {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            font-size: 11px !important;
            color: #ccc !important;
            cursor: pointer !important;
        }
        .fs-log {
            font-size: 10px !important;
            color: #38bdf8 !important;
            background: #09090e !important;
            padding: 7px 9px !important;
            border-radius: 6px !important;
            border: 1px solid #222234 !important;
            min-height: 22px !important;
            word-break: break-all !important;
            font-family: monospace !important;
        }
    `;

    function applyStyles() {
        if (typeof GM_addStyle === 'function') {
            try { GM_addStyle(CSS_STYLES); return; } catch (e) {}
        }
        if (!document.getElementById('flow-sync-styles')) {
            const style = document.createElement('style');
            style.id = 'flow-sync-styles';
            style.textContent = CSS_STYLES;
            (document.head || document.documentElement).appendChild(style);
        }
    }

    function createUI() {
        if (document.getElementById('flow-sync-widget')) return;
        if (!document.body && !document.documentElement) return;

        applyStyles();

        const widget = document.createElement('div');
        widget.id = 'flow-sync-widget';

        const header = document.createElement('div');
        header.className = 'fs-header';

        const dot = document.createElement('span');
        dot.className = 'fs-dot';
        dot.id = 'fs-status-dot';
        header.appendChild(dot);

        const title = document.createElement('span');
        title.className = 'fs-title';
        title.textContent = 'Flow Bridge v2.1';
        header.appendChild(title);

        const badge = document.createElement('span');
        badge.className = 'fs-badge';
        badge.textContent = 'Live RPC';
        header.appendChild(badge);

        const minBtn = document.createElement('button');
        minBtn.className = 'fs-toggle-btn';
        minBtn.id = 'fs-minimize-btn';
        minBtn.textContent = '—';
        minBtn.title = 'Свернуть/Развернуть';
        header.appendChild(minBtn);
        widget.appendChild(header);

        const body = document.createElement('div');
        body.className = 'fs-body';
        body.id = 'fs-body';

        const statusText = document.createElement('div');
        statusText.className = 'fs-status';
        statusText.id = 'fs-status-text';
        statusText.textContent = 'Подключение к 127.0.0.1:3210...';
        body.appendChild(statusText);

        const controls = document.createElement('div');
        controls.className = 'fs-controls';

        const pullBtn = document.createElement('button');
        pullBtn.className = 'fs-btn fs-btn-primary';
        pullBtn.id = 'fs-pull-btn';
        pullBtn.textContent = '📥 Выгрузить на ПК (Pull All)';
        controls.appendChild(pullBtn);

        const pushBtn = document.createElement('button');
        pushBtn.className = 'fs-btn fs-btn-secondary';
        pushBtn.id = 'fs-push-btn';
        pushBtn.textContent = '🚀 Отправить в Flow (Push All)';
        controls.appendChild(pushBtn);
        body.appendChild(controls);

        const switchLabel = document.createElement('label');
        switchLabel.className = 'fs-switch';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = 'fs-autosync-chk';
        chk.checked = true;
        const chkSpan = document.createElement('span');
        chkSpan.textContent = '⚡ Авто-синхронизация кода';
        switchLabel.appendChild(chk);
        switchLabel.appendChild(chkSpan);
        body.appendChild(switchLabel);

        const logView = document.createElement('div');
        logView.className = 'fs-log';
        logView.id = 'fs-log-view';
        logView.textContent = 'Готов к исполнению генераций';
        body.appendChild(logView);

        widget.appendChild(body);
        (document.body || document.documentElement).appendChild(widget);

        pullBtn.addEventListener('click', pullAllFilesFromFlow);
        pushBtn.addEventListener('click', pushAllFilesToFlow);
        chk.addEventListener('change', (e) => {
            autoSyncEnabled = e.target.checked;
            log(autoSyncEnabled ? 'Авто-синхронизация включена' : 'Авто-синхронизация выключена');
        });

        minBtn.addEventListener('click', () => {
            if (body.style.display === 'none') {
                body.style.display = 'flex';
                minBtn.textContent = '—';
            } else {
                body.style.display = 'none';
                minBtn.textContent = '+';
            }
        });

        let isDragging = false, startX, startY, startLeft, startTop;
        header.addEventListener('mousedown', (e) => {
            if (e.target === minBtn) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = widget.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            widget.style.right = 'auto';
            widget.style.left = `${startLeft}px`;
            widget.style.top = `${startTop}px`;
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            widget.style.left = `${startLeft + (e.clientX - startX)}px`;
            widget.style.top = `${startTop + (e.clientY - startY)}px`;
        });
        window.addEventListener('mouseup', () => { isDragging = false; });
    }

    function log(msg) {
        console.log(`[FlowBridge] ${msg}`);
        const logView = document.getElementById('fs-log-view');
        if (logView) logView.textContent = msg;
    }

    function updateStatus(connected, text) {
        isConnected = connected;
        const dot = document.getElementById('fs-status-dot');
        const statusText = document.getElementById('fs-status-text');
        if (dot) dot.className = `fs-dot ${connected ? 'connected' : ''}`;
        if (statusText) statusText.textContent = text || (connected ? '🟢 Мост активен: RPC готов' : '🔴 Мост отключен');
    }

    // Listen for response from iframe
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'FLOW_BRIDGE_GENERATE_RESULT') {
            const { id, status, base64, mimeType, mediaId, error } = event.data;
            log(`Ответ от фрейма [${id}]: ${status}`);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    id: id,
                    event: 'generate_image_res',
                    status: status,
                    mediaId: mediaId,
                    base64: base64,
                    mimeType: mimeType,
                    error: error
                }));
            }
            if (pendingGenerations.has(id)) {
                pendingGenerations.delete(id);
            }
        }
    });

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

        try {
            ws = new WebSocket(BRIDGE_WS);
            ws.onopen = () => {
                updateStatus(true, '🟢 Мост активен: RPC готов');
                log('Связь с локальным сервером установлена');
                ws.send(JSON.stringify({ event: 'identify', role: 'flow_tab' }));
            };

            ws.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if ((data.event === 'file_changed' || data.event === 'file_created') && !isPulling) {
                        if (autoSyncEnabled) {
                            log(`⚡ Изменение: ${data.path}`);
                            await applyFileUpdateToFlow(data.path, data.content);
                        }
                    }
                    if (data.event === 'generate_image_req') {
                        log(`🎨 Генерация: "${data.prompt.slice(0, 30)}..."`);
                        await handleGenerationRequest(data);
                    }
                } catch (e) {
                    console.error('[FlowBridge] WS parse error:', e);
                }
            };

            ws.onclose = () => {
                updateStatus(false, '🔴 Мост отключен (127.0.0.1:3210)');
                setTimeout(connectWebSocket, 2000);
            };

            ws.onerror = () => { ws.close(); };
        } catch (e) {
            updateStatus(false, '🔴 Ошибка соединения');
            setTimeout(connectWebSocket, 3000);
        }
    }

    async function handleGenerationRequest(req) {
        const { id, prompt, aspectRatio, modelDisplayName } = req;
        log(`Исполнение запроса [${id}]...`);

        try {
            // Priority 1: Send postMessage to runner iframe if present
            const runnerIframe = document.querySelector('iframe[src*="scf.usercontent.goog"]') ||
                                 document.querySelector('iframe[src*="flow-applet"]') ||
                                 document.querySelector('iframe');

            if (runnerIframe && runnerIframe.contentWindow) {
                log('⚡ Запрос отправлен в runner iframe...');
                pendingGenerations.set(id, Date.now());
                runnerIframe.contentWindow.postMessage({
                    type: 'FLOW_BRIDGE_GENERATE',
                    id: id,
                    prompt: prompt,
                    aspectRatio: aspectRatio || '1:1',
                    modelDisplayName: modelDisplayName || '🍌 Nano Banana Pro'
                }, '*');

                // Wait up to 60s for postMessage response
                const startTime = Date.now();
                while (pendingGenerations.has(id) && Date.now() - startTime < 60000) {
                    await new Promise(r => setTimeout(r, 500));
                }

                if (!pendingGenerations.has(id)) {
                    // Handled by message listener
                    return;
                }
            }

            // Priority 2: Fallback to Flow canvas / UI automation
            log('⚡ Попытка исполнения через UI Flow...');
            const imageResult = await automateFlowUIGeneration(prompt, aspectRatio);

            if (imageResult && imageResult.base64) {
                log(`🎉 Генерация [${id}] завершена! Отправка на ПК...`);
                ws.send(JSON.stringify({
                    id: id,
                    event: 'generate_image_res',
                    status: 'success',
                    mediaId: imageResult.mediaId || `flow-${Date.now()}`,
                    base64: imageResult.base64,
                    mimeType: imageResult.mimeType || 'image/png'
                }));
            } else {
                throw new Error('Пустой результат генерации от Flow');
            }
        } catch (err) {
            log(`❌ Ошибка: ${err.message}`);
            ws.send(JSON.stringify({
                id: id,
                event: 'generate_image_res',
                status: 'error',
                error: err.message
            }));
        }
    }

    async function automateFlowUIGeneration(promptText, aspectRatio) {
        const textarea = document.querySelector('textarea.prompt-textarea') ||
                         document.querySelector('textarea[placeholder*="Describe"]') ||
                         document.querySelector('textarea');

        if (!textarea) {
            throw new Error('Не найдено поле ввода промпта в Google Flow.');
        }

        textarea.focus();
        textarea.value = promptText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 300));

        const sendBtn = document.querySelector('button[aria-label*="Generate"]') ||
                        document.querySelector('button[aria-label*="Send"]') ||
                        document.querySelector('button.submit-button') ||
                        document.querySelector('button.send-button');

        if (sendBtn) {
            sendBtn.click();
        } else {
            textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }

        return await waitForNewGeneratedImage(60000);
    }

    async function waitForNewGeneratedImage(timeoutMs = 60000) {
        const startTime = Date.now();
        const initialImages = new Set(Array.from(document.querySelectorAll('img')).map(i => i.src));

        while (Date.now() - startTime < timeoutMs) {
            await new Promise(r => setTimeout(r, 1000));

            if (lastGeneratedBase64) {
                const b64 = lastGeneratedBase64;
                lastGeneratedBase64 = null;
                return { base64: b64, mimeType: 'image/png' };
            }

            const currentImgs = Array.from(document.querySelectorAll('img'));
            for (const img of currentImgs) {
                if (!initialImages.has(img.src) && img.src && (img.src.includes('googleusercontent.com') || img.src.startsWith('blob:') || img.src.startsWith('data:image'))) {
                    log('Найдено новое изображение в DOM!');
                    const base64 = await convertImgUrlToBase64(img.src);
                    if (base64) {
                        return { base64: base64, mimeType: 'image/png' };
                    }
                }
            }
        }
        throw new Error('Превышен таймаут ожидания изображения от Google Flow');
    }

    async function convertImgUrlToBase64(url) {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result;
                    const b64 = result.split(',')[1];
                    resolve(b64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error('Failed to convert image url to base64:', e);
            return null;
        }
    }

    // Global fetch interceptor
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
            if (url.includes('FlowService') || url.includes('ogiZ0b') || url.includes('batchexecute')) {
                const clone = response.clone();
                clone.text().then(text => {
                    const match = text.match(/https:\/\/[^"'\\]+googleusercontent\.com\/[^"'\\]+/);
                    if (match && match[0]) {
                        log('Перехвачен URL сгенерированного кадра!');
                        convertImgUrlToBase64(match[0]).then(b64 => {
                            if (b64) lastGeneratedBase64 = b64;
                        });
                    }
                }).catch(() => {});
            }
        } catch (e) {}
        return response;
    };

    function getFlowFileListElements() {
        const items = Array.from(document.querySelectorAll('.file-item'));
        return items.map(item => {
            const nameEl = item.querySelector('.file-name') || item;
            const fullName = (nameEl.innerText || nameEl.textContent).trim();
            return { name: fullName, element: item };
        });
    }

    function getCurrentEditorContent() {
        const lines = Array.from(document.querySelectorAll('.code-line')).map(l => {
            const content = l.querySelector('.line-content') || l;
            return content.innerText || content.textContent || '';
        });
        if (lines.length > 0) return lines.join('\n');

        const pre = document.querySelector('pre');
        if (pre) return pre.innerText || pre.textContent;

        const textarea = document.querySelector('textarea.inputarea') || document.querySelector('textarea');
        if (textarea) return textarea.value;

        return null;
    }

    async function applyFileUpdateToFlow(filePath, content) {
        log(`Трансляция ${filePath}...`);
        const fileElements = getFlowFileListElements();
        const normalized = filePath.replace(/^[\\\/]/, '').toLowerCase();

        const target = fileElements.find(f => {
            const cur = f.name.replace(/^[\\\/]/, '').toLowerCase();
            return cur === normalized || cur.endsWith(normalized) || normalized.endsWith(cur);
        });

        if (target) {
            target.element.click();
            await new Promise(r => setTimeout(r, 200));

            const inputArea = document.querySelector('textarea.inputarea') || 
                              document.querySelector('textarea') ||
                              document.querySelector('[contenteditable="true"]') ||
                              document.querySelector('.code-container');

            if (inputArea) {
                inputArea.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, content);
                log(`✅ ${filePath} обновлен!`);
                return true;
            } else {
                log(`✅ ${filePath} открыт во Flow`);
                return true;
            }
        }

        log(`⚠️ Вкладка не найдена: ${filePath}`);
        return false;
    }

    async function pullAllFilesFromFlow() {
        isPulling = true;
        log('Чтение всех файлов из Flow...');
        const extractedFiles = {};
        const fileElements = getFlowFileListElements();
        log(`Найдено файлов: ${fileElements.length}`);

        for (const item of fileElements) {
            log(`Выгрузка: ${item.name}...`);
            item.element.click();
            await new Promise(r => setTimeout(r, 400));

            const content = getCurrentEditorContent();
            if (content !== null) {
                extractedFiles[item.name] = content;
            }
        }

        const count = Object.keys(extractedFiles).length;
        if (count === 0) {
            log('❌ Файлы не найдены.');
            isPulling = false;
            return;
        }

        log(`Отправка ${count} файлов на ПК...`);
        try {
            const response = await fetch(`${BRIDGE_HTTP}/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: extractedFiles })
            });
            const res = await response.json();
            if (res.status === 'ok') {
                log(`🎉 Выгружено ${res.saved_count} файлов в src/ на ПК!`);
            } else {
                log(`Ошибка: ${JSON.stringify(res)}`);
            }
        } catch (e) {
            log(`❌ Ошибка связи с ${BRIDGE_HTTP}: ${e.message}`);
        } finally {
            setTimeout(() => { isPulling = false; }, 1500);
        }
    }

    async function pushAllFilesToFlow() {
        log('Запрос файлов с ПК...');
        try {
            const response = await fetch(`${BRIDGE_HTTP}/files`);
            const data = await response.json();
            const files = data.files || {};
            const keys = Object.keys(files);

            log(`Отправка ${keys.length} файлов...`);
            for (const path of keys) {
                await applyFileUpdateToFlow(path, files[path]);
                await new Promise(r => setTimeout(r, 250));
            }
            log('🎉 Все локальные файлы отправлены в Flow!');
        } catch (e) {
            log(`❌ Ошибка: ${e.message}`);
        }
    }

    setInterval(() => {
        createUI();
        connectWebSocket();
    }, 1500);

    createUI();
    connectWebSocket();
})();
