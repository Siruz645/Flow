// ==UserScript==
// @name         Google Flow Live Sync & Generation Bridge
// @namespace    https://flow.google.com/
// @version      2.2.0
// @description  Двусторонняя синхронизация файлов и проброс генерации изображений и видео между Google Flow и локальным ПК
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

// Google Flow Live Sync & Video/Image Generation Bridge v2.2.0
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
        console.log('[FlowBridge:Iframe] Initialized in frame:', window.location.href, document.title);

        async function getFlowSDK() {
            let flowObj = window.Flow;
            if (!flowObj || !flowObj.generate) {
                try {
                    const mod = await import('flow-sdk');
                    flowObj = mod.Flow || mod.default || mod;
                } catch (e) {
                    console.warn('[FlowBridge:Iframe] import(flow-sdk) failed:', e);
                }
            }
            if (!flowObj && window.parent && window.parent.Flow) {
                flowObj = window.parent.Flow;
            }
            return flowObj;
        }

        window.addEventListener('message', async (event) => {
            if (!event.data || typeof event.data !== 'object') return;

            // Probe handler
            if (event.data.type === 'FLOW_BRIDGE_PROBE') {
                const { id } = event.data;
                const flowObj = await getFlowSDK();
                const generateKeys = flowObj?.generate ? Object.keys(flowObj.generate) : [];
                const flowKeys = flowObj ? Object.keys(flowObj) : [];

                window.parent.postMessage({
                    type: 'FLOW_BRIDGE_PROBE_RESULT',
                    id: id,
                    frameUrl: window.location.href,
                    title: document.title,
                    hasFlow: !!flowObj,
                    flowKeys: flowKeys,
                    generateKeys: generateKeys
                }, '*');
                return;
            }

            // Image generation handler
            if (event.data.type === 'FLOW_BRIDGE_GENERATE') {
                const { id, prompt, aspectRatio, modelDisplayName, referenceBase64, referenceMimeType } = event.data;
                console.log(`[FlowBridge:Iframe] 🎨 Received image request [${id}]: "${prompt}"`);

                try {
                    const flowObj = await getFlowSDK();
                    if (!flowObj || !flowObj.generate || !flowObj.generate.image) {
                        throw new Error('Flow.generate.image недоступен в рантайме текущего фрейма');
                    }

                    const refIds = [];
                    if (referenceBase64 && flowObj.upload) {
                        console.log('[FlowBridge:Iframe] Uploading reference image...');
                        const up = await flowObj.upload({
                            base64: referenceBase64,
                            mimeType: referenceMimeType || 'image/png',
                            name: 'ref_image.png'
                        });
                        if (up?.mediaId) refIds.push(up.mediaId);
                    }

                    const opts = {
                        prompt: prompt,
                        aspectRatio: aspectRatio || '1:1',
                        modelDisplayName: modelDisplayName || '🍌 Nano Banana Pro'
                    };
                    if (refIds.length > 0) opts.referenceImageMediaIds = refIds;

                    const result = await flowObj.generate.image(opts);
                    window.parent.postMessage({
                        type: 'FLOW_BRIDGE_GENERATE_RESULT',
                        id: id,
                        status: 'success',
                        mediaId: result.mediaId || result.id || `img-${Date.now()}`,
                        base64: result.base64,
                        mimeType: result.mimeType || 'image/png'
                    }, '*');
                } catch (err) {
                    console.error('[FlowBridge:Iframe] Image generation error:', err);
                    window.parent.postMessage({
                        type: 'FLOW_BRIDGE_GENERATE_RESULT',
                        id: id,
                        status: 'error',
                        error: err.message || String(err)
                    }, '*');
                }
                return;
            }

            // Video generation handler
            if (event.data.type === 'FLOW_BRIDGE_GENERATE_VIDEO') {
                const { id, prompt, modelDisplayName, firstFrameBase64, firstFrameMimeType, lastFrameBase64, lastFrameMimeType, aspectRatio, durationSeconds, resolution } = event.data;
                console.log(`[FlowBridge:Iframe] 🎬 Received video request [${id}]: "${prompt}" (model: ${modelDisplayName})`);

                try {
                    const flowObj = await getFlowSDK();
                    if (!flowObj || !flowObj.generate || !flowObj.generate.video) {
                        throw new Error('Flow.generate.video недоступен в рантайме текущего фрейма');
                    }

                    let firstMediaId = undefined;
                    let lastMediaId = undefined;

                    if (firstFrameBase64 && flowObj.upload) {
                        console.log('[FlowBridge:Iframe] Uploading first frame...');
                        const up1 = await flowObj.upload({
                            base64: firstFrameBase64,
                            mimeType: firstFrameMimeType || 'image/png',
                            name: 'first_frame.png'
                        });
                        firstMediaId = up1?.mediaId;
                    }

                    if (lastFrameBase64 && flowObj.upload) {
                        console.log('[FlowBridge:Iframe] Uploading last frame for morphing...');
                        const up2 = await flowObj.upload({
                            base64: lastFrameBase64,
                            mimeType: lastFrameMimeType || 'image/png',
                            name: 'last_frame.png'
                        });
                        lastMediaId = up2?.mediaId;
                    }

                    const videoOpts = {
                        prompt: prompt || 'Cinematic movement',
                        aspectRatio: aspectRatio || '16:9',
                        durationSeconds: durationSeconds || 5
                    };
                    if (modelDisplayName) videoOpts.modelDisplayName = modelDisplayName;
                    if (firstMediaId) videoOpts.firstFrameImageMediaId = firstMediaId;
                    if (lastMediaId) videoOpts.lastFrameImageMediaId = lastMediaId;
                    if (resolution) videoOpts.resolution = resolution;

                    console.log('[FlowBridge:Iframe] Invoking Flow.generate.video:', JSON.stringify(videoOpts));
                    const result = await flowObj.generate.video(videoOpts);

                    if (!result || !result.base64) {
                        throw new Error('Flow.generate.video вернул пустой результат');
                    }

                    console.log(`[FlowBridge:Iframe] 🎉 Video generation succeeded! (${result.base64.length} chars b64)`);
                    window.parent.postMessage({
                        type: 'FLOW_BRIDGE_GENERATE_RESULT',
                        id: id,
                        status: 'success',
                        mediaId: result.mediaId || result.id || `vid-${Date.now()}`,
                        base64: result.base64,
                        mimeType: result.mimeType || 'video/mp4'
                    }, '*');
                } catch (err) {
                    console.error('[FlowBridge:Iframe] Video generation error:', err);
                    window.parent.postMessage({
                        type: 'FLOW_BRIDGE_GENERATE_RESULT',
                        id: id,
                        status: 'error',
                        error: err.message || String(err)
                    }, '*');
                }
                return;
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
    const probeResponses = new Map();

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
            padding: 7px 12px !important;
            border-radius: 6px !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            border: none !important;
            transition: all 0.2s ease !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
        }
        .fs-btn-primary { background: #4f46e5 !important; color: #fff !important; }
        .fs-btn-primary:hover { background: #4338ca !important; }
        .fs-btn-secondary { background: #272738 !important; color: #e2e8f0 !important; border: 1px solid #3f3f5a !important; }
        .fs-btn-secondary:hover { background: #323248 !important; }
        .fs-switch {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            font-size: 11px !important;
            color: #cbd5e1 !important;
            cursor: pointer !important;
        }
        .fs-switch input { cursor: pointer !important; accent-color: #4f46e5 !important; }
        .fs-log {
            background: #09090d !important;
            border: 1px solid #232334 !important;
            border-radius: 6px !important;
            padding: 8px !important;
            font-family: monospace !important;
            font-size: 10px !important;
            color: #94a3b8 !important;
            max-height: 80px !important;
            overflow-y: auto !important;
            word-break: break-all !important;
        }
    `;

    function applyStyles() {
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
        title.textContent = 'Flow Bridge v2.2';
        header.appendChild(title);

        const badge = document.createElement('span');
        badge.className = 'fs-badge';
        badge.textContent = 'Video+RPC';
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

    // Listen for responses from iframes
    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;

        // Generation result
        if (event.data.type === 'FLOW_BRIDGE_GENERATE_RESULT') {
            const { id, status, base64, mimeType, mediaId, error } = event.data;
            log(`Ответ от фрейма [${id}]: ${status} (${mimeType || 'unknown'})`);

            const genMeta = pendingGenerations.get(id);
            const isVideo = (mimeType && mimeType.includes('video')) || (genMeta && genMeta.type === 'video');
            const resEvent = isVideo ? 'generate_video_res' : 'generate_image_res';

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    id: id,
                    event: resEvent,
                    status: status,
                    mediaId: mediaId,
                    base64: base64,
                    mimeType: mimeType || (isVideo ? 'video/mp4' : 'image/png'),
                    error: error
                }));
            }
            pendingGenerations.delete(id);
            return;
        }

        // Probe result
        if (event.data.type === 'FLOW_BRIDGE_PROBE_RESULT') {
            const { id } = event.data;
            console.log(`[FlowBridge] Probe response received from iframe [${id}]:`, event.data);
            if (!probeResponses.has(id)) {
                probeResponses.set(id, []);
            }
            probeResponses.get(id).push(event.data);
            return;
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
                        log(`🎨 Генерация: "${data.prompt?.slice(0, 30)}..."`);
                        await handleGenerationRequest(data);
                    }
                    if (data.event === 'generate_video_req') {
                        log(`🎬 Видео-генерация: "${data.prompt?.slice(0, 30)}..."`);
                        await handleVideoGenerationRequest(data);
                    }
                    if (data.event === 'probe_flow_req') {
                        log(`🔍 Диагностический опрос [${data.id}]...`);
                        await handleProbeRequest(data);
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

    async function handleProbeRequest(req) {
        const { id } = req;
        probeResponses.set(id, []);
        const iframes = Array.from(document.querySelectorAll('iframe'));

        log(`Опрос ${iframes.length} фреймов...`);
        for (const ifr of iframes) {
            try {
                ifr.contentWindow?.postMessage({
                    type: 'FLOW_BRIDGE_PROBE',
                    id: id
                }, '*');
            } catch (e) {}
        }

        await new Promise(r => setTimeout(r, 1500));
        const collected = probeResponses.get(id) || [];
        probeResponses.delete(id);

        const responsePayload = {
            id: id,
            event: 'probe_flow_res',
            status: 'success',
            hostUrl: window.location.href,
            iframesCount: iframes.length,
            probeResults: collected
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(responsePayload));
        }
    }

    async function handleGenerationRequest(req) {
        const { id, prompt, aspectRatio, modelDisplayName, referenceBase64, referenceMimeType } = req;
        log(`Исполнение запроса [${id}]...`);
        pendingGenerations.set(id, { type: 'image', startTime: Date.now() });

        try {
            const allIframes = Array.from(document.querySelectorAll('iframe'));
            if (allIframes.length > 0) {
                log(`⚡ Запрос отправлен во фреймы Flow (${allIframes.length})...`);
                for (const ifr of allIframes) {
                    try {
                        ifr.contentWindow?.postMessage({
                            type: 'FLOW_BRIDGE_GENERATE',
                            id: id,
                            prompt: prompt,
                            aspectRatio: aspectRatio || '1:1',
                            modelDisplayName: modelDisplayName || '🍌 Nano Banana Pro',
                            referenceBase64: referenceBase64,
                            referenceMimeType: referenceMimeType
                        }, '*');
                    } catch (e) {}
                }

                const startTime = Date.now();
                while (pendingGenerations.has(id) && Date.now() - startTime < 60000) {
                    await new Promise(r => setTimeout(r, 500));
                }

                if (!pendingGenerations.has(id)) {
                    return;
                }
            }

            // Priority 2: Fallback to Flow canvas / UI automation for images
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
        } finally {
            pendingGenerations.delete(id);
        }
    }

    async function handleVideoGenerationRequest(req) {
        const { id, prompt, modelDisplayName, firstFrameBase64, firstFrameMimeType, lastFrameBase64, lastFrameMimeType, aspectRatio, durationSeconds, resolution } = req;
        log(`Исполнение видео-запроса [${id}]...`);
        pendingGenerations.set(id, { type: 'video', startTime: Date.now() });

        try {
            const allIframes = Array.from(document.querySelectorAll('iframe'));
            if (allIframes.length === 0) {
                throw new Error('Iframe приложения Flow не найден на странице. Откройте инструмент в Google Flow.');
            }

            log(`⚡ Видео-запрос направлен во фреймы Flow (${allIframes.length})...`);
            for (const ifr of allIframes) {
                try {
                    ifr.contentWindow?.postMessage({
                        type: 'FLOW_BRIDGE_GENERATE_VIDEO',
                        id: id,
                        prompt: prompt,
                        modelDisplayName: modelDisplayName || 'Omni 1.1 Flash',
                        firstFrameBase64: firstFrameBase64,
                        firstFrameMimeType: firstFrameMimeType,
                        lastFrameBase64: lastFrameBase64,
                        lastFrameMimeType: lastFrameMimeType,
                        aspectRatio: aspectRatio || '16:9',
                        durationSeconds: durationSeconds || 5,
                        resolution: resolution || '720p'
                    }, '*');
                } catch (e) {}
            }

            // Wait up to 210s for video generation in iframe
            const startTime = Date.now();
            while (pendingGenerations.has(id) && Date.now() - startTime < 210000) {
                await new Promise(r => setTimeout(r, 500));
            }

            if (!pendingGenerations.has(id)) {
                return;
            }

            throw new Error('Таймаут ожидания генерации видео в iframe (превышено 210 сек). Проверьте активность вкладки Flow.');
        } catch (err) {
            log(`❌ Ошибка видео: ${err.message}`);
            ws.send(JSON.stringify({
                id: id,
                event: 'generate_video_res',
                status: 'error',
                error: err.message
            }));
        } finally {
            pendingGenerations.delete(id);
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
                    if (img.naturalWidth > 120 || img.width > 120 || img.src.includes('=s')) {
                        log('Найдено новое изображение в DOM!');
                        const base64 = await convertImgUrlToBase64(img.src);
                        if (base64) {
                            return { base64: base64, mimeType: 'image/png' };
                        }
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
                        log('Перехвачен URL сгенерированного ресурса!');
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
