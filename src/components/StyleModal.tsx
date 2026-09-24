import React, { useState, useEffect, useRef } from 'react';

export interface RegionStyle {
  id?: string;
  name: string;
  description: string;
  json?: string;
  imagePreview?: string;
  palette?: string[];
  art_style_manner?: string;
  rendering_technique?: string;
  lighting_schema?: string;
  flow_prompt_directive?: string;
  materials?: string;
  lighting?: string;
  medium?: string;
  details?: string;
  render_instructions?: string;
  isAnalyzing?: boolean;
  analysisPromise?: Promise<RegionStyle | null>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetRegionName: string;
  currentStyle?: RegionStyle | null;
  onSaveStyle: (style: RegionStyle | null) => void;
}

export const STYLE_PRESETS: RegionStyle[] = [
  {
    name: 'Cyberpunk Neon',
    description: 'Яркий неоновый киберпанк с хромированными отражениями и объемным неоновым светом',
    palette: ['#00f0ff', '#ff003c', '#7928ca', '#121212'],
    materials: 'Reflective chrome, glossy plastic, glowing LEDs',
    lighting: 'Volumetric cyan and magenta neon rim lighting',
    medium: 'Cinematic cyberpunk digital art, Blade Runner aesthetic',
    json: JSON.stringify({
      style_name: 'Cyberpunk Neon',
      medium: 'Cinematic cyberpunk digital art',
      materials: 'Reflective chrome, glossy plastic, glowing LEDs',
      lighting: 'Volumetric cyan and magenta neon rim lighting',
      palette: ['#00f0ff', '#ff003c', '#7928ca', '#121212']
    }, null, 2)
  },
  {
    name: 'Масляная живопись (Oil Painting)',
    description: 'Классическая академическая масляная живопись с выразительными мазками мастихина и богатым кракелюром',
    palette: ['#8b4513', '#d2b48c', '#cd853f', '#2f4f4f'],
    materials: 'Heavy oil paint impasto, textured canvas weave',
    lighting: 'Chiaroscuro Rembrandt warm studio lighting',
    medium: 'Classic museum masterpiece oil painting',
    json: JSON.stringify({
      style_name: 'Classic Oil Painting',
      medium: 'Classic museum oil painting on canvas',
      materials: 'Heavy oil paint impasto, textured canvas weave',
      lighting: 'Chiaroscuro Rembrandt warm studio lighting',
      palette: ['#8b4513', '#d2b48c', '#cd853f', '#2f4f4f']
    }, null, 2)
  },
  {
    name: 'Жидкое золото и хром (Liquid Gold)',
    description: 'Люксовая текучая текстура расплавленного золота с зеркальными отражениями и полированным металлом',
    palette: ['#ffd700', '#daa520', '#b8860b', '#1a1a1a'],
    materials: 'Molten liquid gold, mirror chrome, polished platinum',
    lighting: 'High-contrast studio reflection lighting, caustic sparkles',
    medium: 'Luxury 3D metallic procedural shader render',
    json: JSON.stringify({
      style_name: 'Liquid Gold & Mirror Chrome',
      medium: 'Luxury 3D metallic shader render',
      materials: 'Molten liquid gold, mirror chrome, polished platinum',
      lighting: 'High-contrast studio reflection lighting, caustics',
      palette: ['#ffd700', '#daa520', '#b8860b', '#1a1a1a']
    }, null, 2)
  },
  {
    name: 'Anime Aesthetic (Макото Синкай)',
    description: 'Красочный аниме-арт с детализированным небом, мягкими лучами света и яркими чистыми цветами',
    palette: ['#38bdf8', '#fb7185', '#fef08a', '#1e293b'],
    materials: 'Cel-shaded anime textures, smooth gradient fills',
    lighting: 'Sunburst golden hour rays, sparkling lens flares',
    medium: 'High-end CoMix Wave anime movie still, Makoto Shinkai style',
    json: JSON.stringify({
      style_name: 'Makoto Shinkai Anime Aesthetic',
      medium: 'High-end anime feature film still',
      materials: 'Cel-shaded anime textures, smooth gradient fills',
      lighting: 'Sunburst golden hour rays, sparkling lens flares',
      palette: ['#38bdf8', '#fb7185', '#fef08a', '#1e293b']
    }, null, 2)
  },
  {
    name: 'Пластилин / 3D Clay (Pixar)',
    description: 'Очаровательный тактильный пластилиновый стиль с отпечатками пальцев и мягким студийным светом',
    palette: ['#f43f5e', '#06b6d4', '#eab308', '#ec4899'],
    materials: 'Matte modeling clay, soft dough, subtle fingerprint texture',
    lighting: 'Softbox warm studio lighting, diffuse ambient occlusion',
    medium: 'Stop-motion claymation render, Aardman / Pixar Clay style',
    json: JSON.stringify({
      style_name: 'Tactile Claymation 3D',
      medium: 'Stop-motion claymation 3D render',
      materials: 'Matte modeling clay, soft dough, subtle fingerprint texture',
      lighting: 'Softbox warm studio lighting, diffuse ambient occlusion',
      palette: ['#f43f5e', '#06b6d4', '#eab308', '#ec4899']
    }, null, 2)
  },
  {
    name: 'Винтажная пленка 80-х (35mm Kodak)',
    description: 'Аналоговая пленочная фотография 1980-х с теплой зернистостью, виньеткой и ретро-цветопередачей',
    palette: ['#d97706', '#92400e', '#047857', '#451a03'],
    materials: 'Organic 35mm film grain, analog print paper, faded dye',
    lighting: 'Warm ambient tungsten and retro sunlight with halation',
    medium: 'Vintage 35mm Kodak Portra film photograph',
    json: JSON.stringify({
      style_name: 'Vintage 35mm Film',
      medium: 'Vintage 35mm Kodak Portra photograph',
      materials: 'Organic 35mm film grain, analog print paper',
      lighting: 'Warm ambient tungsten and golden halation',
      palette: ['#d97706', '#92400e', '#047857', '#451a03']
    }, null, 2)
  }
];

export async function requestFlowVisionAnalysis(base64Data: string, mimeType: string = 'image/png'): Promise<RegionStyle> {
  const cleanB64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  
  // 1. Try Bridge Server /api/analyze_style
  try {
    const res = await fetch('http://127.0.0.1:3210/api/analyze_style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: cleanB64, mimeType })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.style) {
        const s = data.style;
        return {
          name: s.style_name || 'AI Reference Style',
          description: s.flow_prompt_directive || s.art_style_manner || s.render_instructions || s.description || `${s.medium || ''}, ${s.materials || ''}`.trim(),
          art_style_manner: s.art_style_manner,
          rendering_technique: s.rendering_technique,
          lighting_schema: s.lighting_schema,
          flow_prompt_directive: s.flow_prompt_directive || s.render_instructions,
          medium: s.medium || s.art_style_manner,
          materials: s.materials || s.rendering_technique,
          lighting: s.lighting || s.lighting_schema,
          palette: Array.isArray(s.palette) ? s.palette : [],
          json: JSON.stringify(s, null, 2)
        };
      }
    }
  } catch (err) {
    console.warn('[StyleModal] Bridge analyze_style failed, trying direct Flow SDK fallback...', err);
  }

  // 2. Direct Flow SDK fallback (if running in iframe)
  try {
    const { Flow } = await import('flow-sdk');
    const prompt = `Ты — ведущий арт-директор. Извлеки ТОЛЬКО ХУДОЖЕСТВЕННЫЙ СТИЛЬ, МАНЕРУ РИСОВКИ И ГРАФИЧЕСКИЙ ПАЙПЛАЙН из изображения.
ЗАПРЕЩЕНО описывать одежду, позы, мускулы, анатомию, лицо, персонажей или сюжет.
Опиши исключительно манеру рисовки, рендер, свет и колористику.
Выведи СТРОГИЙ JSON объект:
{
  "style_name": "Название стиля (на русском)",
  "art_style_manner": "Манера рисовки и визуальная эстетика (без персонажей/одежды)",
  "rendering_technique": "Техника рендера, шейдинг, блики",
  "lighting_schema": "Световая схема, контраст, rim lighting",
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "flow_prompt_directive": "Промпт-директива на английском для генератора Flow"
}`;
    const textRes = await Flow.generate.text({
      prompt: prompt,
      images: [{ base64: cleanB64, mimeType }]
    });

    const raw = textRes?.text?.trim() || '';
    let clean = raw;
    if (clean.startsWith('```')) {
      const lines = clean.split('\n');
      if (lines[0].startsWith('```') && lines[lines.length - 1].startsWith('```')) {
        clean = lines.slice(1, -1).join('\n').trim();
      }
    }
    const parsed = JSON.parse(clean);
    return {
      name: parsed.style_name || 'AI Reference Style',
      description: parsed.flow_prompt_directive || parsed.art_style_manner || parsed.render_instructions || parsed.description || `${parsed.medium || ''}, ${parsed.materials || ''}`.trim(),
      art_style_manner: parsed.art_style_manner,
      rendering_technique: parsed.rendering_technique,
      lighting_schema: parsed.lighting_schema,
      flow_prompt_directive: parsed.flow_prompt_directive || parsed.render_instructions,
      medium: parsed.medium || parsed.art_style_manner,
      materials: parsed.materials || parsed.rendering_technique,
      lighting: parsed.lighting || parsed.lighting_schema,
      palette: Array.isArray(parsed.palette) ? parsed.palette : [],
      json: JSON.stringify(parsed, null, 2)
    };
  } catch (err: any) {
    console.error('[StyleModal] Flow SDK vision error:', err);
    throw new Error('Не удалось проанализировать стиль: ' + (err.message || String(err)));
  }
}

export function StyleModal({
  isOpen,
  onClose,
  targetRegionName,
  currentStyle,
  onSaveStyle
}: Props) {
  if (!isOpen) return null;

  const [styleName, setStyleName] = useState(currentStyle?.name || '');
  const [styleDescription, setStyleDescription] = useState(currentStyle?.description || '');
  const [jsonContent, setJsonContent] = useState(currentStyle?.json || '');
  const [palette, setPalette] = useState<string[]>(currentStyle?.palette || []);
  const [imagePreview, setImagePreview] = useState<string | null>(currentStyle?.imagePreview || null);
  const [isAnalyzing, setIsAnalyzing] = useState(currentStyle?.isAnalyzing || false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedPresetName, setSelectedPresetName] = useState<string>(currentStyle?.name || '');
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentPromiseRef = useRef<Promise<RegionStyle | null> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  const handleProcessImageFile = (file: File) => {
    setErrorMsg(null);
    setIsAnalyzing(true);
    setSelectedPresetName('Кастомный референс (ИИ анализ)');

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreview(dataUrl);

      // Launch background AI Vision extraction
      const promise = (async () => {
        try {
          const aiResult = await requestFlowVisionAnalysis(dataUrl, file.type || 'image/png');
          setStyleName(aiResult.name);
          setStyleDescription(aiResult.description || aiResult.medium || '');
          setPalette(aiResult.palette || []);
          setJsonContent(aiResult.json || '');
          setIsAnalyzing(false);

          return {
            ...aiResult,
            imagePreview: dataUrl,
            isAnalyzing: false
          };
        } catch (err: any) {
          console.error('Vision analysis error:', err);
          setErrorMsg(err.message || 'Ошибка AI-анализа');
          setIsAnalyzing(false);
          return null;
        }
      })();

      currentPromiseRef.current = promise;
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleProcessImageFile(files[0]);
    }
  };

  const selectPreset = (preset: RegionStyle) => {
    setSelectedPresetName(preset.name);
    setStyleName(preset.name);
    setStyleDescription(preset.description);
    setJsonContent(preset.json || '');
    setPalette(preset.palette || []);
    setImagePreview(null);
    setIsAnalyzing(false);
    currentPromiseRef.current = null;
    setIsDropdownOpen(false);
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setIsAnalyzing(false);
    currentPromiseRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApply = () => {
    if (!styleName.trim() && !styleDescription.trim() && !imagePreview) {
      onSaveStyle(null);
      onClose();
      return;
    }

    let cleanJson = jsonContent;
    if (!cleanJson.trim()) {
      cleanJson = JSON.stringify({
        style_name: styleName || 'Custom Style',
        description: styleDescription,
        palette: palette
      }, null, 2);
    }

    const finalStyle: RegionStyle = {
      name: styleName.trim() || 'Пользовательский стиль',
      description: styleDescription.trim(),
      json: cleanJson,
      imagePreview: imagePreview || undefined,
      palette: palette.length > 0 ? palette : undefined,
      isAnalyzing: isAnalyzing,
      analysisPromise: isAnalyzing && currentPromiseRef.current ? currentPromiseRef.current : undefined
    };

    onSaveStyle(finalStyle);
    onClose();
  };

  const handleResetStyle = () => {
    onSaveStyle(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-[#0e0e15] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-white font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#12121c]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-600/30 text-base">
              🎨
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight uppercase flex items-center gap-2">
                <span>Настройка стиля для</span>
                <span className="text-violet-400">@{targetRegionName}</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Загрузите референс или выберите готовый стиль из каталога
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Single View, No Tabs */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          
          {/* Section 1: Drag & Drop Image Zone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <span>1. Референсная картинка стиля</span>
                <span className="text-[9px] text-violet-400 font-normal font-mono">(Авто-анализ Flow AI Vision)</span>
              </label>
              {imagePreview && (
                <button
                  onClick={handleClearImage}
                  className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                >
                  Удалить референс
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) handleProcessImageFile(e.target.files[0]);
              }}
              accept="image/*"
              className="hidden"
            />

            {!imagePreview ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative rounded-2xl border-2 border-dashed transition-all p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-2.5 ${
                  isDragging 
                    ? 'border-violet-500 bg-violet-600/15 shadow-lg shadow-violet-600/20' 
                    : 'border-white/10 hover:border-violet-500/50 bg-zinc-900/40 hover:bg-zinc-900/70'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xl text-violet-400">
                  <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">
                    Перетащите картинку сюда или <span className="text-violet-400 underline">выберите файл</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    ИИ мгновенно извлечет палитру, текстуру, освещение и технику
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative p-3 rounded-2xl bg-zinc-900/80 border border-white/10 flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-black border border-white/10 flex-shrink-0">
                  <img src={imagePreview} alt="Style Reference" className="w-full h-full object-cover" />
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate">
                      {styleName || 'Анализ стиля...'}
                    </span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-bold text-violet-400 hover:text-violet-300 underline cursor-pointer"
                    >
                      Заменить
                    </button>
                  </div>
                  
                  {isAnalyzing ? (
                    <p className="text-[10px] text-violet-300 font-mono animate-pulse flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
                      <span>Flow AI Vision извлекает параметры стиля в фоне...</span>
                    </p>
                  ) : (
                    <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                      <span>✓</span>
                      <span>Стиль и палитра успешно извлечены из изображения</span>
                    </p>
                  )}

                  {palette.length > 0 && (
                    <div className="flex items-center gap-1 pt-1">
                      <span className="text-[9px] text-slate-500 uppercase font-mono mr-1">Палитра:</span>
                      {palette.map((hex, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-xl">
                {errorMsg}
              </p>
            )}
          </div>

          {/* Section 2: Prompt / Description Zone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                2. Описание стиля (Промпт для Flow)
              </label>
              <button
                type="button"
                onClick={() => setShowJsonEditor(!showJsonEditor)}
                className="text-[9px] font-bold font-mono text-violet-400 hover:text-violet-300 cursor-pointer"
              >
                {showJsonEditor ? 'Скрыть Style JSON' : '{ } Редактировать JSON'}
              </button>
            </div>

            <textarea
              value={styleDescription}
              onChange={(e) => setStyleDescription(e.target.value)}
              placeholder="Опишите художественный стиль (например: «Яркий неоновый киберпанк, хромированные текстуры, мягкий объемный свет»)"
              rows={3}
              className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-3.5 text-xs font-medium text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-none placeholder:text-zinc-600 leading-relaxed"
            />

            {showJsonEditor && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="text-[9px] font-mono text-slate-500 uppercase">Расширенный Style JSON:</div>
                <textarea
                  value={jsonContent}
                  onChange={(e) => setJsonContent(e.target.value)}
                  rows={4}
                  className="w-full bg-black/60 border border-violet-500/30 font-mono text-[11px] text-violet-200 rounded-xl p-3 focus:outline-none focus:border-violet-400 transition-all resize-none"
                />
              </div>
            )}
          </div>

          {/* Section 3: Preset Selector Dropdown */}
          <div className="space-y-2 relative" ref={dropdownRef}>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              3. Библиотека готовых стилей
            </label>

            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full px-4 py-3 rounded-2xl bg-zinc-900 border border-white/10 hover:border-violet-500/40 text-left flex items-center justify-between transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="text-base">🎨</span>
                <span className="text-xs font-bold text-white truncate">
                  {selectedPresetName || 'Выберите готовый стиль из списка...'}
                </span>
              </div>
              <span className={`material-symbols-outlined text-sm text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180 text-violet-400' : ''}`}>
                expand_more
              </span>
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#13131e] border border-violet-500/30 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                {STYLE_PRESETS.map((p, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectPreset(p)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                      selectedPresetName === p.name
                        ? 'bg-violet-600/30 border border-violet-500/50 text-white'
                        : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="text-xs font-bold text-white truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{p.description}</div>
                    </div>
                    {p.palette && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {p.palette.map((c, i) => (
                          <div key={i} className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-[#12121c]">
          <button
            onClick={handleResetStyle}
            className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-bold transition-all cursor-pointer"
          >
            Сбросить стиль
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              Отмена
            </button>
            <button
              onClick={handleApply}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-violet-600/30 active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <span>✓</span>
              <span>Применить к @{targetRegionName}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
