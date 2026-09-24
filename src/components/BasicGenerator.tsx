import React, { useState, useEffect, useRef } from 'react';
import { Flow, checkBridgeStatus, BridgeStatus } from '../mock-flow-sdk';

interface GeneratedItem {
  id: string;
  prompt: string;
  base64: string;
  mimeType: string;
  aspectRatio: string;
  model: string;
  createdAt: string;
}

interface BasicGeneratorProps {
  onSendToEditor?: (mediaItem: { base64: string; mimeType: string; name: string; mediaId?: string }) => void;
  guidedPreset?: { prompt: string; model: string; aspect: string } | null;
}

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1', desc: 'Квадрат' },
  { label: '16:9', value: '16:9', desc: 'Пейзаж' },
  { label: '9:16', value: '9:16', desc: 'Shorts' },
  { label: '4:3', value: '4:3', desc: 'Классика' },
  { label: '3:4', value: '3:4', desc: 'Портрет' }
];

export function BasicGenerator({ onSendToEditor, guidedPreset }: BasicGeneratorProps) {
  const [prompt, setPrompt] = useState(guidedPreset?.prompt || '');
  const [aspectRatio, setAspectRatio] = useState(guidedPreset?.aspect || '1:1');
  const [model, setModel] = useState(guidedPreset?.model || '🍌 Nano Banana Pro');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImage, setCurrentImage] = useState<GeneratedItem | null>(null);
  const [history, setHistory] = useState<GeneratedItem[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const handleAddReferenceFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1];
        setReferenceImages((prev) => (prev.length < 4 ? [...prev, b64] : prev));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    online: false,
    flowTabsConnected: 0,
    isFlowReady: false,
    message: 'Проверка подключения...'
  });

  useEffect(() => {
    if (guidedPreset) {
      setPrompt(guidedPreset.prompt);
      setModel(guidedPreset.model);
      setAspectRatio(guidedPreset.aspect);
    }
  }, [guidedPreset]);
  const [error, setError] = useState<string | null>(null);

  // Poll bridge status every 2.5 seconds
  useEffect(() => {
    let active = true;
    async function update() {
      const status = await checkBridgeStatus();
      if (active) setBridgeStatus(status);
    }
    update();
    const interval = setInterval(update, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      console.log('[BasicGenerator] Requesting image for:', prompt);
      const res = await Flow.generate.image({
        prompt: prompt.trim(),
        aspectRatio: aspectRatio,
        modelDisplayName: model,
        referenceBase64List: referenceImages.length > 0 ? referenceImages : undefined,
        referenceBase64: referenceImages.length > 0 ? referenceImages[0] : undefined
      });

      if (!res.base64) {
        throw new Error('Пустой ответ генератора');
      }

      const newItem: GeneratedItem = {
        id: res.mediaId || crypto.randomUUID(),
        prompt: prompt.trim(),
        base64: res.base64,
        mimeType: res.mimeType || 'image/png',
        aspectRatio: aspectRatio,
        model: model,
        createdAt: new Date().toLocaleTimeString()
      };

      setCurrentImage(newItem);
      setHistory(prev => [newItem, ...prev]);
    } catch (err: any) {
      console.error('[BasicGenerator] Error:', err);
      setError(err.message || 'Ошибка генерации изображения');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!currentImage) return;
    Flow.download({
      base64: currentImage.base64,
      mimeType: currentImage.mimeType,
      filename: `flow_${Date.now()}.png`
    });
  };

  const handleDelete = (idToDelete?: string) => {
    const targetId = idToDelete || currentImage?.id;
    if (!targetId) return;

    setHistory(prev => {
      const nextHistory = prev.filter(item => item.id !== targetId);
      if (currentImage?.id === targetId) {
        setCurrentImage(nextHistory.length > 0 ? nextHistory[0] : null);
      }
      return nextHistory;
    });
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#070709] text-slate-100">
      {/* Left Control Panel */}
      <div className="w-full lg:w-[460px] bg-[#0d0d14] border-r border-white/5 flex flex-col p-6 overflow-y-auto space-y-6">
        
        {/* Header & Bridge Status Banner */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
              <span className="text-2xl">🍌</span>
              Flow Generator
            </h2>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
              v2.0 Bridge
            </span>
          </div>

          {/* Bridge Status Card */}
          <div className={`p-3.5 rounded-xl border flex items-center gap-3 transition-colors ${
            bridgeStatus.isFlowReady
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
              : bridgeStatus.online
              ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
          }`}>
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
              bridgeStatus.isFlowReady
                ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]'
                : bridgeStatus.online
                ? 'bg-amber-400 shadow-[0_0_10px_#f59e0b]'
                : 'bg-rose-500 shadow-[0_0_10px_#ef4444]'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-tight truncate">{bridgeStatus.message}</p>
              <p className="text-[10px] opacity-75 font-mono mt-0.5">
                {bridgeStatus.isFlowReady
                  ? `Вкладок Flow онлайн: ${bridgeStatus.flowTabsConnected}`
                  : bridgeStatus.online
                  ? 'Откройте flow.google.com с активным скриптом'
                  : 'Запустите: start_bridge.bat'}
              </p>
            </div>
          </div>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Нейросетевая Модель Google Flow
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: '🍌 Nano Banana Pro', label: 'Banana Pro', sub: 'GEM_PIX_2 · 1K-4K', badge: 'Флагман' },
              { id: 'Nano Banana 2', label: 'Banana 2', sub: 'NARWHAL · Быстрый', badge: 'Скорость' },
              { id: 'Nano Banana 2 Lite', label: 'Banana Lite', sub: 'HARBOR_SEAL', badge: 'Драфт' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  model === m.id
                    ? 'bg-violet-600/20 border-violet-500 text-white shadow-lg shadow-violet-600/10'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold truncate">{m.label}</div>
                  <span className={`text-[9px] font-semibold px-1 py-0.2 rounded ${
                    model === m.id ? 'bg-violet-500/30 text-violet-300' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {m.badge}
                  </span>
                </div>
                <div className="text-[10px] font-mono opacity-60 mt-1">{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Соотношение сторон
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {ASPECT_RATIOS.map(ar => (
              <button
                key={ar.value}
                onClick={() => setAspectRatio(ar.value)}
                className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                  aspectRatio === ar.value
                    ? 'bg-violet-600 border-violet-500 text-white font-bold'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="text-xs">{ar.label}</div>
                <div className="text-[9px] opacity-60 truncate">{ar.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Reference Images */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Референсы ({referenceImages.length}/4)
            </label>
            <span className="text-[10px] text-violet-400 font-mono">Стиль / Композиция</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {referenceImages.map((b64, idx) => (
              <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-violet-500/40 bg-black/40 flex-shrink-0">
                <img
                  src={`data:image/png;base64,${b64}`}
                  alt={`Ref ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveReferenceImage(idx)}
                  className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 transition-opacity cursor-pointer"
                  title="Удалить референс"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
                <span className="absolute bottom-0.5 right-1 text-[8px] font-mono text-white/70 bg-black/60 px-1 rounded">
                  #{idx + 1}
                </span>
              </div>
            ))}

            {referenceImages.length < 4 && (
              <button
                type="button"
                onClick={() => refFileInputRef.current?.click()}
                className="w-14 h-14 rounded-lg border border-dashed border-white/20 hover:border-violet-400/60 bg-white/5 hover:bg-violet-950/20 flex flex-col items-center justify-center text-slate-400 hover:text-violet-300 transition-all cursor-pointer flex-shrink-0"
                title="Добавить изображение-референс"
              >
                <span className="material-symbols-outlined text-base">add_photo_alternate</span>
                <span className="text-[8px] font-bold mt-0.5">+Реф</span>
              </button>
            )}
          </div>

          <input
            ref={refFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleAddReferenceFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Prompt Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Текстовый промпт
            </label>
            <span className="text-[10px] text-slate-500 font-mono">{prompt.length} знаков</span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Опишите в деталях изображение, которое хотите сгенерировать..."
            rows={4}
            className="w-full bg-[#14141e] border border-white/10 rounded-xl p-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-none"
          />
        </div>

        {/* Error Notice */}
        {error && (
          <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 text-xs">
            {error}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 cursor-pointer ${
            !prompt.trim() || isGenerating
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-violet-600 hover:bg-violet-500 text-white shadow-xl shadow-violet-600/30 active:scale-98'
          }`}
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Генерация через Flow...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              <span>Сгенерировать</span>
            </>
          )}
        </button>

      </div>

      {/* Right Canvas / Preview Viewport */}
      <div className="flex-1 bg-black flex flex-col p-6 items-center justify-center relative overflow-hidden">
        {currentImage ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 max-w-4xl">
            {/* Image Card */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0d0d14] max-h-[70vh] flex items-center justify-center">
              <img
                src={`data:${currentImage.mimeType};base64,${currentImage.base64}`}
                alt={currentImage.prompt}
                className="max-h-[70vh] w-auto object-contain rounded-xl"
              />
              <div className="absolute top-3 left-3 px-3 py-1 bg-black/70 backdrop-blur-md rounded-full text-[11px] font-mono text-white/90 border border-white/10">
                {currentImage.model} • {currentImage.aspectRatio}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 w-full justify-between max-w-2xl bg-[#0e0e15] p-3 rounded-2xl border border-white/5">
              <p className="text-xs text-slate-300 font-medium truncate flex-1 min-w-0 pr-2" title={currentImage.prompt}>
                "{currentImage.prompt}"
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleDownload}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Скачать PNG
                </button>
                {onSendToEditor && (
                  <button
                    onClick={() => onSendToEditor({
                      base64: currentImage.base64,
                      mimeType: currentImage.mimeType,
                      name: currentImage.prompt.slice(0, 25),
                      mediaId: currentImage.id
                    })}
                    className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-violet-600/20 whitespace-nowrap flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Отредактировать
                  </button>
                )}
                <button
                  onClick={() => handleDelete(currentImage.id)}
                  title="Удалить картинку"
                  className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  Удалить
                </button>
              </div>
            </div>

            {/* History Strip */}
            {history.length > 1 && (
              <div className="flex gap-2 overflow-x-auto w-full max-w-xl py-2">
                {history.map(item => (
                  <div key={item.id} className="relative group/thumb flex-shrink-0">
                    <button
                      onClick={() => setCurrentImage(item)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                        currentImage.id === item.id
                          ? 'border-violet-500 ring-2 ring-violet-500/50 scale-105'
                          : 'border-white/10 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={`data:${item.mimeType};base64,${item.base64}`}
                        alt={item.prompt}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      title="Удалить из ленты"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-md cursor-pointer z-10"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center space-y-4 max-w-md">
            <div className="w-20 h-20 bg-violet-500/10 rounded-3xl flex items-center justify-center mx-auto border border-violet-500/20 text-3xl">
              🍌
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white uppercase tracking-wider">
                Окно генерации
              </h3>
              <p className="text-sm text-slate-400">
                Введите описание кадра слева и нажмите «Сгенерировать». Картинка появится здесь мгновенно.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
