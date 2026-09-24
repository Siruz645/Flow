import React, { useState, useCallback, useEffect } from 'react';
import { Flow } from 'flow-sdk';
import { MagicInspector } from './components/MagicInspector';
import { ModificationPanel } from './components/ModificationPanel';
import { HistoryGallery } from './components/HistoryGallery';
import { useObjectDetector } from './hooks/useObjectDetector';
import { IntroModal } from './components/IntroModal';
import { BasicGenerator } from './components/BasicGenerator';
import { ImageToolboxGuide } from './components/ImageToolboxGuide';
import { getFlowAspectRatio } from './services/ImageProcessor';

export interface Box {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface Detection {
  label: string;
  score: number;
  boundingBox: Box;
}

export interface HistoryItem {
  mediaId: string;
  base64: string;
  mimeType: string;
  name: string;
  id: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'basic' | 'editor'>('basic');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guidedPreset, setGuidedPreset] = useState<{ prompt: string; model: string; aspect: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState<number>(0);
  
  const [editorModel, setEditorModel] = useState<string>('Nano Banana 2');
  const [mediaSize, setMediaSize] = useState<{width: number, height: number} | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [manualBox, setManualBox] = useState<Box | null>(null);
  const [candidates, setCandidates] = useState<number[]>([]); 
  const [refinementIndex, setRefinementIndex] = useState<number | null>(null); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<HistoryItem | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { detector, isLoading: isDetectorLoading, error: detectorError } = useObjectDetector();

  const activeMedia = history[activeHistoryIndex] || null;

  // Auto-run detection when detector is ready or active media changes
  useEffect(() => {
    if (activeTab === 'editor' && detector && activeMedia && detections.length === 0 && !isProcessing) {
      runDetection(activeMedia);
    }
  }, [activeTab, detector, activeMedia, detections.length, isProcessing]);

  // Listen for generation requests from host Flow page via postMessage
  useEffect(() => {
    const handleBridgeMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'FLOW_BRIDGE_GENERATE') {
        const { id, prompt, aspectRatio, modelDisplayName } = event.data;
        console.log('[App.tsx] ⚡ Received FLOW_BRIDGE_GENERATE request:', prompt);
        try {
          const gen = await Flow.generate.image({
            prompt,
            aspectRatio: aspectRatio || '1:1',
            modelDisplayName: modelDisplayName || 'Nano Banana 2'
          });
          window.parent.postMessage({
            type: 'FLOW_BRIDGE_GENERATE_RESULT',
            id,
            status: 'success',
            mediaId: gen.mediaId,
            base64: gen.base64,
            mimeType: gen.mimeType
          }, '*');
        } catch (err: any) {
          console.error('[App.tsx] ❌ Generation failed:', err);
          window.parent.postMessage({
            type: 'FLOW_BRIDGE_GENERATE_RESULT',
            id,
            status: 'error',
            error: err.message || 'Generation error in Flow iframe'
          }, '*');
        }
      }
    };

    window.addEventListener('message', handleBridgeMessage);
    return () => window.removeEventListener('message', handleBridgeMessage);
  }, []);

  const handleMediaSelect = async () => {
    try {
      const media = await Flow.media.select({ filter: 'image' });
      if (media) {
        const newItem: HistoryItem = {
          ...media,
          id: crypto.randomUUID()
        };
        setHistory([newItem]);
        setActiveHistoryIndex(0);
        resetEditorState();
        
        const img = new Image();
        img.src = `data:${media.mimeType};base64,${media.base64}`;
        await img.decode();
        setMediaSize({ width: img.naturalWidth, height: img.naturalHeight });
      }
    } catch (err) {
      console.error(err);
      setError('Не удалось выбрать изображение');
    }
  };

  const handleReceiveFromBasic = async (mediaItem: { base64: string; mimeType: string; name: string }) => {
    try {
      // Register in Flow media store so reference editing works reliably
      const uploaded = await Flow.upload({
        base64: mediaItem.base64,
        mimeType: mediaItem.mimeType as any,
        name: mediaItem.name
      });
      
      const newItem: HistoryItem = {
        mediaId: uploaded.mediaId || `gen-${crypto.randomUUID()}`,
        base64: mediaItem.base64,
        mimeType: mediaItem.mimeType,
        name: mediaItem.name,
        id: crypto.randomUUID()
      };
      setHistory([newItem]);
      setActiveHistoryIndex(0);
      resetEditorState();

      const img = new Image();
      img.src = `data:${newItem.mimeType};base64,${newItem.base64}`;
      await img.decode();
      setMediaSize({ width: img.naturalWidth, height: img.naturalHeight });

      setActiveTab('editor');
    } catch (err) {
      console.error('Receive from basic error:', err);
    }
  };

  const resetEditorState = () => {
    setDetections([]);
    setSelectedIndex(null);
    setManualBox(null);
    setCandidates([]);
    setRefinementIndex(null);
    setResultImage(null);
    setError(null);
  };

  const runDetection = async (media: HistoryItem) => {
    if (!detector) return;
    setIsProcessing(true);
    try {
      const img = new Image();
      img.src = `data:${media.mimeType};base64,${media.base64}`;
      await img.decode();

      const result = detector.detect(img);
      const mapped = result.detections.map(d => ({
        label: d.categories[0].categoryName,
        score: d.categories[0].score,
        boundingBox: {
          originX: d.boundingBox?.originX || 0,
          originY: d.boundingBox?.originY || 0,
          width: d.boundingBox?.width || 0,
          height: d.boundingBox?.height || 0,
        }
      }));
      setDetections(mapped);
    } catch (err) {
      console.error(err);
      setError('Ошибка при анализе изображения');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModify = async (prompt: string) => {
    if (!activeMedia || !mediaSize) return;
    setIsProcessing(true);
    setError(null);
    try {
      let targetInfo = 'the whole scene';
      
      if (manualBox) {
        if (refinementIndex !== null) {
          const det = detections[refinementIndex];
          targetInfo = `the specific ${det.label} in the selected region`;
        } else {
          targetInfo = 'the selected region of the image';
        }
      } else if (selectedIndex !== null) {
        const det = detections[selectedIndex];
        targetInfo = `the ${det.label}`;
      }

      const aspect = getFlowAspectRatio(mediaSize.width, mediaSize.height);
      const generation = await Flow.generate.image({
        prompt: `Modify ${targetInfo} as follows: ${prompt}. Keep the rest of the scene composition, background, and lighting completely natural and consistent with the original image.`,
        referenceBase64: activeMedia.base64,
        referenceMimeType: activeMedia.mimeType,
        referenceImageMediaIds: [activeMedia.mediaId],
        modelDisplayName: editorModel,
        aspectRatio: aspect,
      });
      
      if (!generation.base64) {
        throw new Error('Пустой ответ генератора Flow');
      }

      setResultImage({
        base64: generation.base64,
        mimeType: generation.mimeType || 'image/png',
        mediaId: generation.mediaId || `edit-${crypto.randomUUID()}`,
        name: `Результат: ${prompt.slice(0, 15)}...`,
        id: crypto.randomUUID()
      });
      
    } catch (err: any) {
      console.error('Modify Error:', err);
      setError(err.message || 'Ошибка генерации. Попробуйте другой запрос.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePromoteResult = () => {
    if (!resultImage) return;
    const newHistory = [...history, resultImage];
    setHistory(newHistory);
    setActiveHistoryIndex(newHistory.length - 1);
    setResultImage(null);
    resetEditorState();
  };

  const handleDownloadResult = () => {
    if (!resultImage) return;
    Flow.download({
      base64: resultImage.base64,
      mimeType: resultImage.mimeType,
      filename: `flow_edited_${Date.now()}.png`
    });
  };

  const handleSelectFromHistory = (index: number) => {
    setActiveHistoryIndex(index);
    resetEditorState();
  };

  const findCandidates = useCallback((box: Box) => {
    const found: number[] = [];
    detections.forEach((d, idx) => {
      const obj = d.boundingBox;
      const xOverlap = Math.max(0, Math.min(box.originX + box.width, obj.originX + obj.width) - Math.max(box.originX, obj.originX));
      const yOverlap = Math.max(0, Math.min(box.originY + box.height, obj.originY + obj.height) - Math.max(box.originY, obj.originY));
      const overlapArea = xOverlap * yOverlap;
      const objArea = obj.width * obj.height;

      if (overlapArea / objArea > 0.4) {
        found.push(idx);
      }
    });
    setCandidates(found);
    setRefinementIndex(null);
  }, [detections]);

  const currentSelectionLabel = manualBox 
    ? (refinementIndex !== null ? detections[refinementIndex].label : 'Область') 
    : (selectedIndex !== null ? detections[selectedIndex].label : null);

  return (
    <div className="flex flex-col h-full bg-[#070709] text-slate-100 overflow-hidden font-sans">
      {showIntro && <IntroModal onStart={() => setShowIntro(false)} />}
      
      {/* Top Main Navigation Bar */}
      <header className="h-14 bg-[#0a0a0f] border-b border-white/5 flex items-center justify-between px-6 z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-violet-600/30">
            F
          </div>
          <span className="font-black text-sm tracking-wider uppercase text-white whitespace-nowrap">
            Google Flow Studio
          </span>
        </div>

        {/* Tab Controls & Right Drawer Trigger */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#13131b] p-1 rounded-xl border border-white/5 gap-1">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${
                activeTab === 'basic'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🍌</span>
              <span>Базовая генерация</span>
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${
                activeTab === 'editor'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>✨</span>
              <span>Редактор</span>
            </button>
          </div>

          <button
            onClick={() => setIsGuideOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 active:scale-95 shadow-sm whitespace-nowrap flex-shrink-0"
          >
            <span>📖</span>
            <span>Справочник & Тест</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Local Engine Active</span>
        </div>
      </header>

      {/* Tab 1: Basic Generator (Persistent DOM to preserve prompts, inputs & generated history) */}
      <div className={`flex-1 flex overflow-hidden ${activeTab === 'basic' ? '' : 'hidden'}`}>
        <BasicGenerator 
          onSendToEditor={handleReceiveFromBasic} 
          guidedPreset={guidedPreset}
        />
      </div>

      {/* Tab 2: Element Editor & Inpainting (Persistent DOM to preserve canvas, detections & history) */}
      <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'editor' ? '' : 'hidden'}`}>
        {history.length > 0 && (
          <HistoryGallery 
            items={history} 
            activeIndex={activeHistoryIndex} 
            onSelect={handleSelectFromHistory} 
          />
        )}

        <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Main Central Viewport: Single Canvas or Side-by-Side Comparison */}
          <div className="flex-1 relative bg-black flex flex-col items-center justify-center p-4 lg:p-6 overflow-hidden">
            {!activeMedia ? (
              <div className="text-center space-y-6 max-w-md animate-in fade-in slide-in-from-bottom-4">
                <div className="w-24 h-24 bg-violet-500/10 rounded-[2rem] flex items-center justify-center mx-auto border border-violet-500/20 shadow-[0_0_50px_rgba(139,92,246,0.15)]">
                  <span className="material-symbols-outlined text-5xl text-violet-400">add_photo_alternate</span>
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight text-white uppercase italic text-center">Загрузите кадр</h2>
                  <p className="text-slate-400 text-sm">Мы найдем объекты сами, или вы сможете выделить их вручную.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleMediaSelect}
                    className="px-10 py-4 bg-violet-600 hover:bg-violet-500 rounded-2xl font-bold transition-all shadow-xl shadow-violet-600/30 flex items-center gap-3 mx-auto active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined">upload</span>
                    <span>Выбрать фото с диска</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('basic')}
                    className="text-xs text-violet-400 hover:underline font-medium cursor-pointer"
                  >
                    Или сгенерируйте новое через промпт →
                  </button>
                </div>
              </div>
            ) : resultImage ? (
              /* Side-by-Side Comparison Layout when result is generated */
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 animate-in fade-in duration-500 overflow-hidden">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full max-h-[78vh]">
                  {/* Left Column: Original with Selection */}
                  <div className="flex flex-col h-full bg-[#0d0d14] rounded-2xl border border-white/10 overflow-hidden p-3">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 px-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        1. Исходный кадр
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {currentSelectionLabel ? `Фокус: ${currentSelectionLabel}` : 'Оригинал'}
                      </span>
                    </div>
                    <div className="flex-1 relative flex items-center justify-center overflow-hidden rounded-xl bg-black">
                      <MagicInspector 
                        media={activeMedia} 
                        detections={detections} 
                        selectedIndex={selectedIndex}
                        manualBox={manualBox}
                        candidates={candidates}
                        refinementIndex={refinementIndex}
                        onSelect={(idx) => {
                          setSelectedIndex(idx);
                          setManualBox(null);
                          setCandidates([]);
                          setRefinementIndex(null);
                        }}
                        onManualSelect={(box) => {
                          setManualBox(box);
                          setSelectedIndex(null);
                          if (box) findCandidates(box);
                        }}
                        isProcessing={isProcessing}
                      />
                    </div>
                  </div>

                  {/* Right Column: High-Res Edited Result */}
                  <div className="flex flex-col h-full bg-[#0d0d14] rounded-2xl border border-violet-500/30 shadow-2xl shadow-violet-950/30 overflow-hidden p-3">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 px-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        2. Отредактированный результат
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        {editorModel}
                      </span>
                    </div>
                    <div className="flex-1 relative flex items-center justify-center overflow-hidden rounded-xl bg-black">
                      <img 
                        src={`data:${resultImage.mimeType};base64,${resultImage.base64}`} 
                        alt="Result" 
                        className="max-h-full max-w-full object-contain rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Result Action Bar (Single-Line Buttons) */}
                <div className="flex items-center gap-3 w-full justify-between max-w-2xl bg-[#0e0e15] p-3 rounded-2xl border border-white/10 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                    <span className="text-xs text-white font-bold truncate">
                      {resultImage.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handlePromoteResult}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer whitespace-nowrap flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      <span>Сделать основным</span>
                    </button>
                    <button
                      onClick={handleDownloadResult}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-sm">download</span>
                      <span>Скачать PNG</span>
                    </button>
                    <button
                      onClick={() => setResultImage(null)}
                      title="Отклонить результат"
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                      <span>Отменить</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Single Inspector View before generation */
              <div className="w-full h-full flex flex-col items-center justify-center gap-6 animate-in fade-in duration-700 overflow-hidden">
                <MagicInspector 
                  media={activeMedia} 
                  detections={detections} 
                  selectedIndex={selectedIndex}
                  manualBox={manualBox}
                  candidates={candidates}
                  refinementIndex={refinementIndex}
                  onSelect={(idx) => {
                    setSelectedIndex(idx);
                    setManualBox(null);
                    setCandidates([]);
                    setRefinementIndex(null);
                  }}
                  onManualSelect={(box) => {
                    setManualBox(box);
                    setSelectedIndex(null);
                    if (box) findCandidates(box);
                  }}
                  isProcessing={isProcessing}
                />
                <div className="flex gap-4">
                  <button 
                    onClick={handleMediaSelect}
                    className="group px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800 text-[10px] uppercase font-black tracking-widest text-slate-400 hover:text-white flex items-center gap-2 transition-all hover:border-violet-500/50 cursor-pointer whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-sm transition-transform group-hover:rotate-180">cached</span>
                    <span>Загрузить другое</span>
                  </button>
                  {(selectedIndex !== null || manualBox) && (
                    <button 
                      onClick={() => { setSelectedIndex(null); setManualBox(null); setCandidates([]); setRefinementIndex(null); }}
                      className="px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] uppercase font-black tracking-widest text-red-400 hover:bg-red-500/20 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <span>Сбросить выбор</span>
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Spinner Overlay */}
            {(isProcessing || isDetectorLoading) && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] animate-in fade-in duration-300">
                <div className="text-center space-y-6">
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 border-4 border-violet-500/10 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="absolute inset-4 border-2 border-violet-400/20 border-b-violet-400 rounded-full animate-[spin_3s_linear_infinite]"></div>
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-xl font-black text-white animate-pulse uppercase tracking-[0.2em] italic">
                      {isDetectorLoading ? 'Анализ сцены...' : `Редактирование (${editorModel})`}
                    </p>
                    <p className="text-violet-500/60 text-[10px] font-mono uppercase font-bold tracking-widest">
                      Flow Generative Inpainting...
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Control Panel */}
          <div className="w-full md:w-96 bg-[#0d0d12] border-l border-white/5 flex flex-col shadow-2xl z-10 flex-shrink-0">
            <ModificationPanel 
              onModify={handleModify} 
              selectedElement={currentSelectionLabel}
              candidates={candidates.map(i => ({ index: i, label: detections[i].label }))}
              refinementIndex={refinementIndex}
              onRefinementSelect={setRefinementIndex}
              isProcessing={isProcessing || isDetectorLoading}
              selectedModel={editorModel}
              onSelectModel={setEditorModel}
              error={error || detectorError}
            />
          </div>
        </main>
      </div>

      {/* Slide-over Guide Drawer */}
      <ImageToolboxGuide 
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onSelectPrompt={(p, m, a) => {
          setGuidedPreset({ prompt: p, model: m, aspect: a });
          setActiveTab('basic');
        }}
      />
    </div>
  );
}