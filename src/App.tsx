import React, { useState, useCallback, useEffect } from 'react';
import { Flow } from 'flow-sdk';
import { MagicInspector, RegionItem } from './components/MagicInspector';
import { ModificationPanel } from './components/ModificationPanel';
import { HistoryGallery } from './components/HistoryGallery';
import { useObjectDetector } from './hooks/useObjectDetector';
import { IntroModal } from './components/IntroModal';
import { BasicGenerator } from './components/BasicGenerator';
import { ImageToolboxGuide } from './components/ImageToolboxGuide';
import { StyleModal, RegionStyle } from './components/StyleModal';
import { VideoStudio } from './components/VideoStudio';
import { getFlowAspectRatio, compositeMultiRegionEdit } from './services/ImageProcessor';

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
  const [activeTab, setActiveTab] = useState<'basic' | 'editor' | 'video'>('basic');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guidedPreset, setGuidedPreset] = useState<{ prompt: string; model: string; aspect: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState<number>(0);
  
  // Video Studio Bridge State
  const [videoStudioFirstFrame, setVideoStudioFirstFrame] = useState<string | null>(null);
  const [videoStudioLastFrame, setVideoStudioLastFrame] = useState<string | null>(null);
  const [videoStudioPrompt, setVideoStudioPrompt] = useState<string>('');
  
  const [editorModel, setEditorModel] = useState<string>('Nano Banana 2');
  const [inpaintingMode, setInpaintingMode] = useState<'mask_strict' | 'focus_guide'>('mask_strict');
  
  const [mediaSize, setMediaSize] = useState<{width: number, height: number} | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  
  // Multi-Region Selection State
  const [manualRegions, setManualRegions] = useState<RegionItem[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  // Region Style Modal State
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [styleTargetRegionId, setStyleTargetRegionId] = useState<string | null>(null);

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

      if (event.data && event.data.type === 'FLOW_BRIDGE_GENERATE_VIDEO') {
        const { id, prompt, modelDisplayName, firstFrameBase64, firstFrameMimeType, lastFrameBase64, lastFrameMimeType, aspectRatio, durationSeconds, resolution } = event.data;
        console.log('[App.tsx] 🎬 Received FLOW_BRIDGE_GENERATE_VIDEO request:', prompt);
        try {
          let firstFrameImageMediaId: string | undefined;
          let lastFrameImageMediaId: string | undefined;

          if (firstFrameBase64) {
            const up1 = await Flow.upload({
              base64: firstFrameBase64,
              mimeType: (firstFrameMimeType || 'image/png') as any,
              name: 'first_frame.png'
            });
            firstFrameImageMediaId = up1?.mediaId;
          }

          if (lastFrameBase64) {
            const up2 = await Flow.upload({
              base64: lastFrameBase64,
              mimeType: (lastFrameMimeType || 'image/png') as any,
              name: 'last_frame.png'
            });
            lastFrameImageMediaId = up2?.mediaId;
          }

          const videoPayload: any = {
            prompt: prompt || 'Cinematic movement',
            firstFrameImageMediaId,
            lastFrameImageMediaId,
            aspectRatio: aspectRatio || '16:9',
            durationSeconds: durationSeconds ?? 5,
            resolution: resolution || '720p'
          };
          if (modelDisplayName && modelDisplayName !== 'Omni 1.1 Flash') {
            videoPayload.modelDisplayName = modelDisplayName;
          }

          const gen = await Flow.generate.video(videoPayload);

          window.parent.postMessage({
            type: 'FLOW_BRIDGE_GENERATE_RESULT',
            id,
            status: 'success',
            mediaId: gen.mediaId,
            base64: gen.base64,
            mimeType: gen.mimeType || 'video/mp4'
          }, '*');
        } catch (err: any) {
          console.error('[App.tsx] ❌ Video generation failed:', err);
          window.parent.postMessage({
            type: 'FLOW_BRIDGE_GENERATE_RESULT',
            id,
            status: 'error',
            error: err.message || 'Video generation error in Flow iframe'
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
    setManualRegions([]);
    setSelectedRegionId(null);
    setCandidates([]);
    setRefinementIndex(null);
    setResultImage(null);
    setError(null);
  };

  const handleAnimateFrame = (frameBase64: string, promptText?: string) => {
    setVideoStudioFirstFrame(frameBase64);
    setVideoStudioLastFrame(null);
    if (promptText) setVideoStudioPrompt(promptText);
    setActiveTab('video');
  };

  const handleMorphFrames = (firstBase64: string, lastBase64: string, promptText?: string) => {
    setVideoStudioFirstFrame(firstBase64);
    setVideoStudioLastFrame(lastBase64);
    if (promptText) setVideoStudioPrompt(promptText);
    setActiveTab('video');
  };

  const handleAddRegion = (box: Box) => {
    const nextIndex = manualRegions.length + 1;
    const newRegion: RegionItem = {
      id: crypto.randomUUID(),
      name: `Область ${nextIndex}`,
      box: box
    };
    setManualRegions(prev => [...prev, newRegion]);
    setSelectedIndex(null);
  };

  const handleDeleteRegion = (id: string) => {
    setManualRegions(prev => {
      const filtered = prev.filter(r => r.id !== id);
      return filtered.map((r, idx) => ({ ...r, name: `Область ${idx + 1}` }));
    });
    if (selectedRegionId === id) setSelectedRegionId(null);
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

  const handleOpenStyleModal = (region: RegionItem) => {
    setStyleTargetRegionId(region.id);
    setIsStyleModalOpen(true);
  };

  const handleSaveRegionStyle = (style: RegionStyle | null) => {
    if (!styleTargetRegionId) return;
    setManualRegions(prev => prev.map(r => r.id === styleTargetRegionId ? { ...r, style } : r));
    setIsStyleModalOpen(false);
    setStyleTargetRegionId(null);
  };

  const compileFlowInpaintingPrompt = (
    userPrompt: string,
    manualRegions: RegionItem[],
    selectedIndex: number | null,
    detections: Detection[],
    mediaSize: { width: number; height: number } | null,
    inpaintingMode: 'mask_strict' | 'focus_guide'
  ): string => {
    let expandedPrompt = userPrompt;

    if (manualRegions.length > 0 && mediaSize) {
      const regionAnchors = manualRegions.map(r => {
        const left = Math.round((r.box.originX / mediaSize.width) * 100);
        const top = Math.round((r.box.originY / mediaSize.height) * 100);
        const width = Math.round((r.box.width / mediaSize.width) * 100);
        const height = Math.round((r.box.height / mediaSize.height) * 100);
        const cX = Math.round(((r.box.originX + r.box.width / 2) / mediaSize.width) * 100);
        const cY = Math.round(((r.box.originY + r.box.height / 2) / mediaSize.height) * 100);

        const hName = cX < 33 ? 'left' : cX > 66 ? 'right' : 'horizontal center';
        const vName = cY < 33 ? 'upper' : cY > 66 ? 'lower' : 'vertical middle';

        let styleDescriptor = '';
        if (r.style) {
          const specs: string[] = [];
          if (r.style.name) specs.push(`Art Style: "${r.style.name}"`);
          if (r.style.flow_prompt_directive) specs.push(`Artistic Directive: ${r.style.flow_prompt_directive}`);
          if (r.style.art_style_manner) specs.push(`Visual Drawing Manner: ${r.style.art_style_manner}`);
          if (r.style.rendering_technique) specs.push(`Rendering Technique & Shaders: ${r.style.rendering_technique}`);
          if (r.style.lighting_schema) specs.push(`Lighting Schema: ${r.style.lighting_schema}`);
          else if (r.style.lighting) specs.push(`Lighting: ${r.style.lighting}`);
          if (r.style.palette && r.style.palette.length > 0) specs.push(`Color Palette: ${r.style.palette.join(', ')}`);
          if (r.style.description && !r.style.flow_prompt_directive) specs.push(`Details: ${r.style.description}`);

          styleDescriptor = ` [ARTISTIC STYLE TRANSFER: Re-render the visual appearance, shading, and drawing manner of this target strictly in ${specs.join(' | ')}. Apply this artistic rendering medium, lighting, and palette directly onto the target object while preserving the user's intended subject]`;
        }

        // Replace tag in user text
        expandedPrompt = expandedPrompt.replaceAll(
          `@${r.name}`,
          `[Target '${r.name}' at coordinates X:${cX}%, Y:${cY}%${styleDescriptor}]`
        );

        return `'${r.name}' anchor: center at (X:${cX}%, Y:${cY}%), box [X:${left}%-${left + width}%, Y:${top}%-${top + height}%], ${vName}-${hName} area${styleDescriptor}`;
      }).join('; ');

      const hasStyles = manualRegions.some(r => r.style);
      const styleDirective = hasStyles 
        ? "MANDATORY ARTISTIC STYLE TRANSFER: For each target region with a specified style, repaint and shade its surface strictly in the requested artistic rendering medium, shader aesthetic, lighting, and color palette. DO NOT import subjects, clothes, or anatomy from the style reference."
        : "";

      if (inpaintingMode === 'focus_guide') {
        return `CRITICAL SPATIAL & ART STYLE INSTRUCTION: Place and anchor the requested modification EXACTLY at the designated target region coordinates (${regionAnchors}). ${styleDirective} DO NOT move or relocate the subject. Naturally adapt local lighting and reflections around the anchor point. Modification instructions: ${expandedPrompt}. Ensure high artistic fidelity and seamless blending.`;
      } else {
        return `CONTEXTUAL INPAINTING & ART STYLE TRANSFER INSTRUCTION: Carefully examine the reference image context. Apply the requested modification (${expandedPrompt}) directly at the target coordinates (${regionAnchors}). ${styleDirective} The modified surface must authentically embody the specified artistic drawing manner, shader materials, and lighting direction.`;
      }
    }

    if (selectedIndex !== null && detections[selectedIndex]) {
      const d = detections[selectedIndex];
      return `Target object: the ${d.label} in the scene. Modify as follows: ${expandedPrompt}. Maintain consistent lighting, shadows, and scene realism.`;
    }

    return `Modify the image as instructed: ${expandedPrompt}. Maintain scene consistency, natural lighting, and photographic realism.`;
  };

  const [processingStatus, setProcessingStatus] = useState<string | null>(null);

  const handleModify = async (userPrompt: string) => {
    if (!activeMedia || !mediaSize) return;
    setIsProcessing(true);
    setError(null);
    setProcessingStatus(null);

    try {
      let currentManualRegions = manualRegions;

      // Smart Synchronization: Await any pending background AI Vision style analyses
      const pendingStyleRegions = currentManualRegions.filter(r => r.style?.analysisPromise || r.style?.isAnalyzing);
      if (pendingStyleRegions.length > 0) {
        setProcessingStatus('Синхронизация: ожидание Flow AI анализа стиля...');
        console.log('[App.tsx] ⏳ Waiting for pending style analysis promises to resolve before generation...');
        const resolved = await Promise.all(
          currentManualRegions.map(async (r) => {
            if (r.style?.analysisPromise) {
              try {
                const styleResult = await r.style.analysisPromise;
                if (styleResult) {
                  return { ...r, style: { ...styleResult, isAnalyzing: false, analysisPromise: undefined } };
                }
              } catch (e) {
                console.warn('[App.tsx] Failed to await style analysis:', e);
              }
            }
            return r;
          })
        );
        currentManualRegions = resolved;
        setManualRegions(resolved);
      }

      setProcessingStatus(null);

      const aspect = getFlowAspectRatio(mediaSize.width, mediaSize.height);
      const promptToModel = compileFlowInpaintingPrompt(
        userPrompt,
        currentManualRegions,
        selectedIndex,
        detections,
        mediaSize,
        inpaintingMode
      );

      console.log('[App.tsx] 🎨 Compiled Prompt for Flow:', promptToModel);

      const generation = await Flow.generate.image({
        prompt: promptToModel,
        referenceBase64: activeMedia.base64,
        referenceMimeType: activeMedia.mimeType,
        referenceImageMediaIds: [activeMedia.mediaId],
        modelDisplayName: editorModel,
        aspectRatio: aspect,
      });
      
      if (!generation.base64) {
        throw new Error('Пустой ответ генератора Flow');
      }

      let finalBase64 = generation.base64;

      // In Strict Mask Mode: strictly blend only the modified regions into the original image
      if (inpaintingMode === 'mask_strict' && currentManualRegions.length > 0) {
        console.log('[App.tsx] 🎯 Applying Strict Multi-Region Mask Compositing...');
        finalBase64 = await compositeMultiRegionEdit(
          activeMedia.base64,
          generation.base64,
          currentManualRegions.map(r => r.box),
          activeMedia.mimeType
        );
      } else if (inpaintingMode === 'mask_strict' && selectedIndex !== null && detections[selectedIndex]) {
        console.log('[App.tsx] 🎯 Applying Strict Object Mask Compositing...');
        finalBase64 = await compositeMultiRegionEdit(
          activeMedia.base64,
          generation.base64,
          [detections[selectedIndex].boundingBox],
          activeMedia.mimeType
        );
      }

      setResultImage({
        base64: finalBase64,
        mimeType: activeMedia.mimeType || 'image/png',
        mediaId: `edit-${crypto.randomUUID()}`,
        name: `Результат: ${userPrompt.slice(0, 15)}...`,
        id: crypto.randomUUID()
      });
      
    } catch (err: any) {
      console.error('Modify Error:', err);
      setError(err.message || 'Ошибка генерации. Попробуйте другой запрос.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
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

  const currentSelectionLabel = manualRegions.length > 0 
    ? (manualRegions.length === 1 ? manualRegions[0].name : `${manualRegions.length} областей`)
    : (selectedIndex !== null ? detections[selectedIndex]?.label : null);

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
            <button
              onClick={() => setActiveTab('video')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${
                activeTab === 'video'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-purple-300'
              }`}
            >
              <span>🎬</span>
              <span>Видео (Omni)</span>
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
                        regions={manualRegions}
                        selectedRegionId={selectedRegionId}
                        onSelect={(idx) => {
                          setSelectedIndex(idx);
                          setSelectedRegionId(null);
                        }}
                        onAddRegion={handleAddRegion}
                        onDeleteRegion={handleDeleteRegion}
                        onSelectRegion={setSelectedRegionId}
                        onOpenStyleModal={handleOpenStyleModal}
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                          {inpaintingMode === 'mask_strict' ? '🎯 Строго по маске' : '🧠 Фокус внимания'}
                        </span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                          {editorModel}
                        </span>
                      </div>
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
                <div className="flex items-center gap-3 w-full justify-between max-w-4xl bg-[#0e0e15] p-3 rounded-2xl border border-white/10 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                    <span className="text-xs text-white font-bold truncate">
                      {resultImage.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Quick Morph Button: First frame = original, Last frame = result */}
                    <button
                      onClick={() => handleMorphFrames(activeMedia.base64, resultImage.base64, 'Smooth fluid transition morphing before into after, seamless metamorphosis')}
                      className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/20 active:scale-95 cursor-pointer whitespace-nowrap flex-shrink-0"
                      title="Создать видео-морфинг перехода До ➔ После"
                    >
                      <span className="material-symbols-outlined text-sm">auto_videocam</span>
                      <span>🌀 Морфинг (До ➔ После)</span>
                    </button>
                    {/* Quick Animate Result */}
                    <button
                      onClick={() => handleAnimateFrame(resultImage.base64, 'Cinematic animated movement, high fidelity, 4k')}
                      className="px-3 py-2 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/30 text-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap flex-shrink-0"
                      title="Оживить отредактированный кадр в видео (Omni)"
                    >
                      <span className="material-symbols-outlined text-sm text-purple-400">movie</span>
                      <span>🎬 Оживить</span>
                    </button>
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
                  regions={manualRegions}
                  selectedRegionId={selectedRegionId}
                  onSelect={(idx) => {
                    setSelectedIndex(idx);
                    setSelectedRegionId(null);
                  }}
                  onAddRegion={handleAddRegion}
                  onDeleteRegion={handleDeleteRegion}
                  onSelectRegion={setSelectedRegionId}
                  onOpenStyleModal={handleOpenStyleModal}
                  isProcessing={isProcessing}
                />
                <div className="flex gap-4">
                  {activeMedia && (
                    <button 
                      onClick={() => handleAnimateFrame(activeMedia.base64, 'Cinematic living scene, natural camera movement, photorealistic, 4k')}
                      className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] uppercase font-black tracking-widest hover:brightness-110 flex items-center gap-2 transition-all shadow-lg shadow-purple-600/25 active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-sm">movie</span>
                      <span>🎬 Оживить в видео (Omni)</span>
                    </button>
                  )}
                  <button 
                    onClick={handleMediaSelect}
                    className="group px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800 text-[10px] uppercase font-black tracking-widest text-slate-400 hover:text-white flex items-center gap-2 transition-all hover:border-violet-500/50 cursor-pointer whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-sm transition-transform group-hover:rotate-180">cached</span>
                    <span>Загрузить другое</span>
                  </button>
                  {(selectedIndex !== null || manualRegions.length > 0) && (
                    <button 
                      onClick={() => { setSelectedIndex(null); setManualRegions([]); setSelectedRegionId(null); setCandidates([]); setRefinementIndex(null); }}
                      className="px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] uppercase font-black tracking-widest text-red-400 hover:bg-red-500/20 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <span>Сбросить все области</span>
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
                      {processingStatus || (isDetectorLoading ? 'Анализ сцены...' : `Редактирование (${editorModel})`)}
                    </p>
                    <p className="text-violet-500/60 text-[10px] font-mono uppercase font-bold tracking-widest">
                      {processingStatus ? 'Синхронизация стилей перед генерацией...' : (inpaintingMode === 'mask_strict' ? 'Strict Mask Inpainting...' : 'Generative Inpainting...')}
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
              regions={manualRegions}
              onDeleteRegion={handleDeleteRegion}
              onSelectRegion={setSelectedRegionId}
              onOpenStyleModal={handleOpenStyleModal}
              selectedRegionId={selectedRegionId}
              inpaintingMode={inpaintingMode}
              onSelectInpaintingMode={setInpaintingMode}
              onAnimateToVideo={activeMedia ? () => handleAnimateFrame(activeMedia.base64) : undefined}
              error={error || detectorError}
            />
          </div>
        </main>
      </div>

      {/* Tab 3: Video Studio (Omni 1.1 Flash / Veo 3.1) */}
      <div className={`flex-1 flex overflow-hidden ${activeTab === 'video' ? '' : 'hidden'}`}>
        <VideoStudio
          initialFirstFrame={videoStudioFirstFrame}
          initialLastFrame={videoStudioLastFrame}
          initialPrompt={videoStudioPrompt}
          onBackToEditor={() => setActiveTab('editor')}
        />
      </div>

      {/* Style Configuration Modal */}
      {isStyleModalOpen && (
        <StyleModal 
          isOpen={isStyleModalOpen}
          onClose={() => {
            setIsStyleModalOpen(false);
            setStyleTargetRegionId(null);
          }}
          targetRegionName={manualRegions.find(r => r.id === styleTargetRegionId)?.name || 'Область'}
          currentStyle={manualRegions.find(r => r.id === styleTargetRegionId)?.style}
          onSaveStyle={handleSaveRegionStyle}
        />
      )}

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