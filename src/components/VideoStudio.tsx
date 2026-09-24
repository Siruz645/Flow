import React, { useState, useEffect, useRef } from 'react';
import { Flow } from '../mock-flow-sdk';

export interface VideoStudioProps {
  initialFirstFrame?: string | null;
  initialLastFrame?: string | null;
  initialPrompt?: string;
  onBackToEditor?: () => void;
}

type GenerationMode = 'i2v' | 'morph' | 't2v';

const CAMERA_PRESETS = [
  { id: 'cinematic_dolly', label: '🎬 Cinematic Dolly In', prompt: 'Smooth cinematic slow push-in shot, high production value, dramatic lighting, sharp focus' },
  { id: 'drone_orbit', label: '🛸 Drone Orbit 360°', prompt: 'Dynamic 360-degree drone orbital fly-around, parallax depth, ultra smooth motion' },
  { id: 'fpv_forward', label: '⚡ FPV Speed Dive', prompt: 'Fast-paced FPV dynamic forward fly-through, kinetic energy, motion blur' },
  { id: 'slow_pan', label: '↔️ Smooth Panoramic Pan', prompt: 'Slow elegant horizontal panning shot, revealing environmental details, cinematic atmosphere' },
  { id: 'tilt_reveal', label: '⬆️ Tilt Up Reveal', prompt: 'Low angle slow tilt-up reveal shot, majestic scale, atmospheric volumetric lighting' },
  { id: 'living_photo', label: '🍃 Живое дыхание (Subtle)', prompt: 'Subtle atmospheric living portrait motion, gentle wind in hair, natural breathing, particles floating' },
];

export interface ModelDurationConfig {
  minDuration: number;
  maxDuration: number;
  defaultDuration: number;
  options: number[];
}

export const MODEL_DURATION_CONFIGS: Record<string, ModelDurationConfig> = {
  'Omni 1.1 Flash': {
    minDuration: 4,
    maxDuration: 10,
    defaultDuration: 5,
    options: [4, 5, 6, 7, 8, 9, 10],
  },
  'Veo 3.1': {
    minDuration: 5,
    maxDuration: 10,
    defaultDuration: 5,
    options: [5, 6, 7, 8, 9, 10],
  },
  'Google Veo 2': {
    minDuration: 5,
    maxDuration: 8,
    defaultDuration: 5,
    options: [5, 6, 7, 8],
  },
};

export const VideoStudio: React.FC<VideoStudioProps> = ({
  initialFirstFrame = null,
  initialLastFrame = null,
  initialPrompt = '',
  onBackToEditor
}) => {
  // Mode selection
  const [mode, setMode] = useState<GenerationMode>(
    initialLastFrame ? 'morph' : initialFirstFrame ? 'i2v' : 'i2v'
  );

  // Frames state
  const [firstFrame, setFirstFrame] = useState<string | null>(initialFirstFrame);
  const [lastFrame, setLastFrame] = useState<string | null>(initialLastFrame);

  // Video settings (Default: Omni 1.1 Flash)
  const [model, setModel] = useState<string>('Omni 1.1 Flash');
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [durationSeconds, setDurationSeconds] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('720p');

  const currentDurationConfig = MODEL_DURATION_CONFIGS[model] || MODEL_DURATION_CONFIGS['Omni 1.1 Flash'];

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    const cfg = MODEL_DURATION_CONFIGS[newModel] || MODEL_DURATION_CONFIGS['Omni 1.1 Flash'];
    setDurationSeconds((prev) => {
      if (prev < cfg.minDuration) return cfg.minDuration;
      if (prev > cfg.maxDuration) return cfg.maxDuration;
      return prev;
    });
  };

  // Prompt state
  const [prompt, setPrompt] = useState<string>(
    initialPrompt || 'Cinematic cinematic scene, ultra-realistic motion, highly detailed'
  );
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const firstFileInputRef = useRef<HTMLInputElement>(null);
  const lastFileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Reference images state (up to 4)
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // Autoplay video muted immediately when generated
  useEffect(() => {
    if (generatedVideoUrl && videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('[VideoStudio] Autoplay was prevented by browser policy:', err);
          });
      }
    }
  }, [generatedVideoUrl]);

  // Update frames if initial props change
  useEffect(() => {
    if (initialFirstFrame) setFirstFrame(initialFirstFrame);
    if (initialLastFrame) {
      setLastFrame(initialLastFrame);
      setMode('morph');
    }
  }, [initialFirstFrame, initialLastFrame]);

  // Handle camera preset selection
  const handleApplyPreset = (preset: typeof CAMERA_PRESETS[0]) => {
    setSelectedPreset(preset.id);
    if (prompt.trim()) {
      setPrompt(`${prompt.trim()}, ${preset.prompt}`);
    } else {
      setPrompt(preset.prompt);
    }
  };

  // Image Upload Helpers
  const handleImageFile = (file: File, target: 'first' | 'last') => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1];
      if (target === 'first') setFirstFrame(b64);
      else setLastFrame(b64);
    };
    reader.readAsDataURL(file);
  };

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

  // Generation Handler
  const handleGenerateVideo = async () => {
    if (mode === 'i2v' && !firstFrame) {
      setErrorMsg('Пожалуйста, загрузите начальный кадр для анимации фото (Image-to-Video).');
      return;
    }
    if (mode === 'morph' && (!firstFrame || !lastFrame)) {
      setErrorMsg('Для морфинга необходимы оба кадра: начальный и конечный.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setProgressMsg(`Подготовка запроса к модели ${model}...`);

    let elapsedSec = 0;
    const timerInterval = setInterval(() => {
      elapsedSec += 1;
      setProgressMsg(`🎬 Генерация видео в Google Flow [${model}]... (${elapsedSec} сек / ~45-90 сек)`);
    }, 1000);

    try {
      setProgressMsg(`🎬 Генерация видео через Google Flow [${model}]... (0 сек)`);

      const result = await Flow.generate.video({
        prompt: prompt || 'Cinematic fluid motion, high fidelity',
        modelDisplayName: model,
        firstFrameBase64: firstFrame || undefined,
        firstFrameImageMediaId: firstFrame && !firstFrame.startsWith('data:') && firstFrame.length < 80 ? firstFrame : undefined,
        lastFrameBase64: mode === 'morph' ? lastFrame || undefined : undefined,
        lastFrameImageMediaId: mode === 'morph' && lastFrame && !lastFrame.startsWith('data:') && lastFrame.length < 80 ? lastFrame : undefined,
        referenceBase64List: referenceImages.length > 0 ? referenceImages : undefined,
        aspectRatio,
        durationSeconds: mode === 't2v' ? durationSeconds : undefined,
        resolution
      });

      if (result && result.base64) {
        const videoDataUrl = `data:${result.mimeType || 'video/mp4'};base64,${result.base64}`;
        setGeneratedVideoUrl(videoDataUrl);
        setProgressMsg('✨ Видео успешно создано!');
      } else {
        throw new Error('Модель не вернула данные видео.');
      }
    } catch (err: any) {
      console.error('Video generation error:', err);
      setErrorMsg(err.message || 'Ошибка генерации видео. Убедитесь, что сессия Google Flow активна.');
    } finally {
      clearInterval(timerInterval);
      setIsGenerating(false);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleDownload = () => {
    if (!generatedVideoUrl) return;
    const a = document.createElement('a');
    a.href = generatedVideoUrl;
    a.download = `flow_video_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#070709] text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="h-14 border-b border-white/5 bg-[#0a0a0f] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="material-symbols-outlined text-white text-base">movie</span>
          </div>
          <div>
            <h1 className="text-xs font-black text-white flex items-center gap-2 uppercase tracking-wider">
              Google Flow Video Studio
              <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Omni & Veo SOTA
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Генерация видео, анимация изображений (I2V) и морфинг переходов</p>
          </div>
        </div>

        {onBackToEditor && (
          <button
            onClick={onBackToEditor}
            className="text-xs px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors border border-white/10 font-bold cursor-pointer"
          >
            ← Вернуться в редактор
          </button>
        )}
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Settings & Controls Panel */}
        <div className="w-96 border-r border-white/5 bg-[#0d0d12] p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
          {/* Mode Selector */}
          <div>
            <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase tracking-wider">
              Режим генерации
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setMode('i2v')}
                className={`py-2 px-1 text-xs font-bold rounded-lg transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  mode === 'i2v'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-sm">photo_camera</span>
                <span>Оживить</span>
              </button>
              <button
                onClick={() => setMode('morph')}
                className={`py-2 px-1 text-xs font-bold rounded-lg transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  mode === 'morph'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-sm">auto_videocam</span>
                <span>Морфинг</span>
              </button>
              <button
                onClick={() => setMode('t2v')}
                className={`py-2 px-1 text-xs font-bold rounded-lg transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  mode === 't2v'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                <span>Текст-видео</span>
              </button>
            </div>
          </div>

          {/* Model Selector (Omni by default) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Модель генерации
              </label>
              <span className="text-[10px] text-purple-400 font-bold">Default: Omni</span>
            </div>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors font-medium"
            >
              <option value="Omni 1.1 Flash">⚡ Omni 1.1 Flash (Быстрая, мультимодальная, SOTA)</option>
              <option value="Veo 3.1">🎥 Veo 3.1 (Высокая кинематографичность)</option>
              <option value="Google Veo 2">🎬 Google Veo 2 (Глубокий физический реализм)</option>
            </select>
          </div>

          {/* Frame Input Slots */}
          {mode !== 't2v' && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                {mode === 'morph' ? 'Кадры перехода (Начало ➔ Конец)' : 'Начальный кадр (First Frame)'}
              </label>

              <div className="grid grid-cols-2 gap-2">
                {/* First Frame Box */}
                <div className={`relative border border-dashed rounded-xl p-2 flex flex-col items-center justify-center min-h-[105px] text-center transition-colors ${
                  firstFrame ? 'border-purple-500/50 bg-purple-950/20' : 'border-white/10 bg-black/30 hover:border-white/20'
                }`}>
                  {firstFrame ? (
                    <div className="w-full h-full flex flex-col items-center relative group">
                      <img
                        src={`data:image/png;base64,${firstFrame}`}
                        alt="First frame"
                        className="w-full h-16 object-cover rounded-lg"
                      />
                      <span className="text-[9px] text-purple-300 mt-1 font-bold">1-й кадр (Старт)</span>
                      <button
                        onClick={() => setFirstFrame(null)}
                        className="absolute top-1 right-1 p-1 bg-black/80 hover:bg-red-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Удалить"
                      >
                        <span className="material-symbols-outlined text-xs">delete</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => firstFileInputRef.current?.click()}
                      className="cursor-pointer flex flex-col items-center gap-1 p-2"
                    >
                      <span className="material-symbols-outlined text-slate-500 text-lg">cloud_upload</span>
                      <span className="text-[10px] text-slate-400 font-bold">Загрузить старт</span>
                    </div>
                  )}
                  <input
                    ref={firstFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file, 'first');
                    }}
                  />
                </div>

                {/* Last Frame Box (for Morphing) */}
                {mode === 'morph' && (
                  <div className={`relative border border-dashed rounded-xl p-2 flex flex-col items-center justify-center min-h-[105px] text-center transition-colors ${
                    lastFrame ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-white/10 bg-black/30 hover:border-white/20'
                  }`}>
                    {lastFrame ? (
                      <div className="w-full h-full flex flex-col items-center relative group">
                        <img
                          src={`data:image/png;base64,${lastFrame}`}
                          alt="Last frame"
                          className="w-full h-16 object-cover rounded-lg"
                        />
                        <span className="text-[9px] text-indigo-300 mt-1 font-bold">2-й кадр (Финиш)</span>
                        <button
                          onClick={() => setLastFrame(null)}
                          className="absolute top-1 right-1 p-1 bg-black/80 hover:bg-red-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Удалить"
                        >
                          <span className="material-symbols-outlined text-xs">delete</span>
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => lastFileInputRef.current?.click()}
                        className="cursor-pointer flex flex-col items-center gap-1 p-2"
                      >
                        <span className="material-symbols-outlined text-slate-500 text-lg">cloud_upload</span>
                        <span className="text-[10px] text-slate-400 font-bold">Загрузить финиш</span>
                      </div>
                    )}
                    <input
                      ref={lastFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFile(file, 'last');
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reference Images Section */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Референсы ({referenceImages.length}/4)
              </label>
              <span className="text-[9px] text-purple-400 font-medium">Стиль / Персонажи</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {referenceImages.map((b64, idx) => (
                <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-purple-500/40 bg-black/40 flex-shrink-0">
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
                  className="w-14 h-14 rounded-lg border border-dashed border-white/20 hover:border-purple-400/60 bg-white/5 hover:bg-purple-950/20 flex flex-col items-center justify-center text-slate-400 hover:text-purple-300 transition-all cursor-pointer flex-shrink-0"
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

          {/* Aspect Ratio & Duration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black text-slate-400 mb-1 block uppercase tracking-wider">
                Формат
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
              >
                <option value="16:9">16:9 (Кино / Пейзаж)</option>
                <option value="9:16">9:16 (Shorts / Reels)</option>
                <option value="1:1">1:1 (Квадрат)</option>
                <option value="4:3">4:3 (Классика 4:3)</option>
                <option value="3:4">3:4 (Портрет 3:4)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">
                  Длительность
                </label>
                <span className="text-[9px] text-purple-400 font-bold">
                  {mode === 't2v' ? `${currentDurationConfig.minDuration}–${currentDurationConfig.maxDuration} сек` : '5 сек (Фикс)'}
                </span>
              </div>
              {mode === 't2v' ? (
                <select
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
                >
                  {currentDurationConfig.options.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec} сек {sec === currentDurationConfig.defaultDuration ? '(По умолчанию)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div 
                  className="w-full bg-zinc-900/60 border border-white/5 rounded-xl px-2.5 py-1.5 text-xs text-slate-400 font-medium cursor-not-allowed flex items-center justify-between"
                  title="Модель Google Flow использует фиксированную длительность ~5 сек для анимации кадров"
                >
                  <span>5 сек (По умолчанию)</span>
                  <span className="text-[9px] text-slate-500 font-mono">Фикс</span>
                </div>
              )}
            </div>
          </div>

          {/* Camera & Motion Presets */}
          <div>
            <label className="text-[10px] font-black text-slate-400 mb-1.5 block uppercase tracking-wider">
              Пресеты движения камеры
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMERA_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleApplyPreset(p)}
                  className={`px-2.5 py-1.5 text-left text-[10px] font-bold rounded-lg border transition-all truncate cursor-pointer ${
                    selectedPreset === p.id
                      ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                      : 'border-white/5 bg-zinc-900/60 text-slate-400 hover:text-slate-200 hover:border-white/10'
                  }`}
                  title={p.prompt}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt input */}
          <div className="flex-1 flex flex-col min-h-[90px]">
            <label className="text-[10px] font-black text-slate-400 mb-1 block uppercase tracking-wider">
              Текстовый промпт движения
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Опишите динамику, окружение, поведение света и движения камеры..."
              className="w-full flex-1 min-h-[70px] bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 resize-none font-sans"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-start gap-2">
              <span className="material-symbols-outlined text-sm text-red-400 flex-shrink-0 mt-0.5">error_outline</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer ${
              isGenerating
                ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50 cursor-not-allowed animate-pulse'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/30 active:scale-95'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                <span className="truncate">{progressMsg || 'Генерация видео...'}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">auto_awesome</span>
                <span>Сгенерировать видео ({model})</span>
              </>
            )}
          </button>
        </div>

        {/* Right Output Video Player Area */}
        <div className="flex-1 bg-[#070709] p-6 flex flex-col items-center justify-center relative overflow-hidden">
          {generatedVideoUrl ? (
            <div className="w-full max-w-4xl flex flex-col items-center gap-4">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black w-full flex items-center justify-center group">
                <video
                  ref={videoRef}
                  src={generatedVideoUrl}
                  controls
                  autoPlay
                  muted
                  playsInline
                  loop
                  className="max-h-[65vh] w-auto object-contain rounded-xl"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>

              {/* Action Toolbar for Video */}
              <div className="flex items-center justify-between w-full px-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold px-3 py-1.5 bg-emerald-950/40 border border-emerald-800 rounded-xl">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Готово: {model} ({aspectRatio})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Скачать MP4
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center max-w-md p-8 rounded-3xl border border-white/5 bg-[#0c0c11]">
              <div className="w-16 h-16 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center text-purple-400 mb-4 shadow-inner">
                <span className="material-symbols-outlined text-3xl">movie</span>
              </div>
              <h2 className="text-base font-black text-white mb-2 uppercase tracking-wider">Видео-студия готова</h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Выберите начальный кадр из редактора или загрузите фото, задайте кинематографическое движение камеры и нажмите «Сгенерировать видео».
              </p>

              <div className="grid grid-cols-2 gap-2 w-full text-[11px] text-slate-400 text-left font-bold">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-400 text-base">360</span>
                  <span>Камера 360° & FPV</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-400 text-base">auto_videocam</span>
                  <span>Плавный морфинг</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
