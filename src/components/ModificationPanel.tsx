import React, { useState, useRef } from 'react';
import { RegionItem } from './MagicInspector';

interface Candidate {
  index: number;
  label: string;
}

interface Props {
  onModify: (prompt: string) => void;
  selectedElement: string | null;
  candidates: Candidate[];
  refinementIndex: number | null;
  onRefinementSelect: (idx: number | null) => void;
  isProcessing: boolean;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  regions: RegionItem[];
  onDeleteRegion: (id: string) => void;
  onSelectRegion: (id: string | null) => void;
  selectedRegionId: string | null;
  inpaintingMode: 'mask_strict' | 'focus_guide';
  onSelectInpaintingMode: (mode: 'mask_strict' | 'focus_guide') => void;
  error: string | null;
}

export function ModificationPanel({ 
  onModify, 
  selectedElement, 
  candidates, 
  refinementIndex, 
  onRefinementSelect, 
  isProcessing, 
  selectedModel,
  onSelectModel,
  regions,
  onDeleteRegion,
  onSelectRegion,
  selectedRegionId,
  inpaintingMode,
  onSelectInpaintingMode,
  error 
}: Props) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention dropdown state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  // List of available mention options
  const mentionOptions = [
    ...regions.map(r => ({ tag: `@${r.name}`, label: r.name, type: 'region', id: r.id })),
    ...(selectedElement ? [{ tag: `@${selectedElement}`, label: selectedElement, type: 'object', id: 'obj' }] : [])
  ];

  const filteredMentions = mentionOptions.filter(m => 
    m.tag.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  // Check for "@" trigger on text change or cursor move
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setPrompt(val);

    const textBeforeCursor = val.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && atIndex >= cursorPos - 20) {
      const query = textBeforeCursor.slice(atIndex);
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionFilter(query);
        setShowMentions(true);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (tag: string) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = prompt.slice(0, cursorPos);
    const textAfterCursor = prompt.slice(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    let newText = prompt;
    if (atIndex !== -1 && showMentions) {
      newText = textBeforeCursor.slice(0, atIndex) + `${tag} ` + textAfterCursor;
    } else {
      newText = textBeforeCursor + `${tag} ` + textAfterCursor;
    }

    setPrompt(newText);
    setShowMentions(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = (atIndex !== -1 && showMentions ? atIndex : cursorPos) + tag.length + 1;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMentions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMentions.length) % filteredMentions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex].tag);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    }
  };

  const handleSubmit = () => {
    if (prompt.trim()) {
      onModify(prompt);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto custom-scrollbar space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2 uppercase">
          <span className="material-symbols-outlined text-violet-400 text-2xl">magic_button</span>
          <span>Редактор Flow</span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
            {inpaintingMode === 'mask_strict' ? 'Strict Inpainting' : 'AI Attention'}
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest whitespace-nowrap">
            Точечное редактирование
          </p>
        </div>
      </div>

      {/* Inpainting Mode Selector (Strict Mask vs Focus of Attention) */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
          <span>Режим применения маски</span>
          <span className="text-[9px] text-violet-400 font-mono font-normal">
            {inpaintingMode === 'mask_strict' ? '100% изоляция фона' : 'Свободный ИИ'}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSelectInpaintingMode('mask_strict')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              inpaintingMode === 'mask_strict'
                ? 'bg-violet-600/20 border-violet-500 text-white shadow-md shadow-violet-600/15 ring-1 ring-violet-500/40'
                : 'bg-zinc-900/60 border-zinc-800 text-slate-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold flex items-center gap-1.5 text-white">
                <span>🎯</span>
                <span>Строго по маске</span>
              </span>
              {inpaintingMode === 'mask_strict' && (
                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-violet-500 text-white">
                  Авто
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-400 mt-1.5 leading-snug">
              Меняется <span className="text-violet-300 font-bold">только</span> внутри выделения, остальной кадр 100% нетронут.
            </p>
          </button>

          <button
            onClick={() => onSelectInpaintingMode('focus_guide')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              inpaintingMode === 'focus_guide'
                ? 'bg-violet-600/20 border-violet-500 text-white shadow-md shadow-violet-600/15 ring-1 ring-violet-500/40'
                : 'bg-zinc-900/60 border-zinc-800 text-slate-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold flex items-center gap-1.5 text-white">
                <span>🧠</span>
                <span>Фокус внимания</span>
              </span>
            </div>
            <p className="text-[9px] text-slate-400 mt-1.5 leading-snug">
              ИИ свободно перерисовывает кадр целиком с акцентом на выбранные области.
            </p>
          </button>
        </div>
      </div>

      {/* Active Regions & Target Management */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Выделенные области ({regions.length})
          </span>
          {regions.length > 0 && (
            <span className="text-[9px] text-emerald-400 font-mono font-bold">
              Вставляйте через @ в текст
            </span>
          )}
        </div>

        {/* Region Chips List */}
        {regions.length > 0 ? (
          <div className="flex flex-wrap gap-2 p-3 bg-zinc-900/80 rounded-2xl border border-white/5">
            {regions.map((reg) => (
              <div
                key={reg.id}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none ${
                  selectedRegionId === reg.id
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10'
                    : 'bg-[#181824] text-slate-300 border-white/10 hover:border-amber-400/40 hover:text-white'
                }`}
                onClick={() => insertMention(`@${reg.name}`)}
                title="Нажмите, чтобы вставить в промпт"
              >
                <span className="text-[10px] text-amber-400">@</span>
                <span>{reg.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRegion(reg.id);
                  }}
                  title="Удалить область"
                  className="hover:bg-red-500/30 text-slate-400 hover:text-red-300 rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition-colors ml-0.5"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl border border-dashed border-white/10 bg-zinc-900/30 text-center">
            <p className="text-xs text-slate-400">Нарисуйте рамку на картинке слева,</p>
            <p className="text-[10px] text-slate-500 mt-0.5">чтобы создать @Область 1, @Область 2 и т.д.</p>
          </div>
        )}

        {/* Candidates Resolution if any */}
        {candidates.length > 0 && (
          <div className="space-y-2 p-3 bg-zinc-900/70 rounded-xl border border-white/5 animate-in slide-in-from-top-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Объекты в зоне:</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onRefinementSelect(null)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer whitespace-nowrap ${
                  refinementIndex === null 
                    ? 'bg-emerald-500 text-black border-emerald-500' 
                    : 'bg-zinc-800 text-slate-400 border-white/5 hover:bg-zinc-700'
                }`}
              >
                Все сразу
              </button>
              {candidates.map((c) => (
                <button
                  key={c.index}
                  onClick={() => onRefinementSelect(c.index)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer whitespace-nowrap ${
                    refinementIndex === c.index 
                      ? 'bg-violet-500 text-white border-violet-500' 
                      : 'bg-zinc-800 text-slate-400 border-white/5 hover:bg-zinc-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Model Selector (Default: Nano Banana 2) */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Модель для редактирования
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'Nano Banana 2', label: 'Banana 2', sub: 'По умолчанию', badge: 'Fast' },
            { id: '🍌 Nano Banana Pro', label: 'Banana Pro', sub: 'GEM_PIX_2', badge: '4K' },
            { id: 'Nano Banana 2 Lite', label: 'Banana Lite', sub: 'HARBOR_SEAL', badge: 'Draft' }
          ].map(m => (
            <button
              key={m.id}
              onClick={() => onSelectModel(m.id)}
              className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                selectedModel === m.id
                  ? 'bg-violet-600/20 border-violet-500 text-white shadow-md shadow-violet-600/10'
                  : 'bg-zinc-900/60 border-zinc-800 text-slate-400 hover:text-white hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold truncate">{m.label}</span>
                <span className={`text-[8px] font-bold px-1 py-0.2 rounded ${
                  selectedModel === m.id ? 'bg-violet-500/30 text-violet-300' : 'bg-zinc-800 text-slate-500'
                }`}>
                  {m.badge}
                </span>
              </div>
              <div className="text-[9px] font-mono opacity-60 mt-0.5 truncate">{m.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input with @-Mention Autocomplete */}
      <div className="space-y-2 relative">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Что изменить? (Введите @ для тега)
          </span>
          <span className="text-[9px] text-slate-500 font-mono">Нажмите @</span>
        </div>

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Опишите правки, например: «В @Область 1 сделай белую лошадь, а в @Область 2 добавь закатное солнце»"
            rows={4}
            className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-4 text-xs font-medium focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-none placeholder:text-zinc-600 text-white leading-relaxed"
          />

          {/* Autocomplete Popup */}
          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-full bg-[#13131c] border border-violet-500/40 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="p-2 border-b border-white/5 bg-[#0e0e15] flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-violet-400">
                  Выберите область (Enter/Tab)
                </span>
                <span className="text-[9px] text-slate-500 font-mono">↑↓ навигация</span>
              </div>
              <div className="max-h-40 overflow-y-auto p-1 space-y-0.5">
                {filteredMentions.map((m, idx) => (
                  <button
                    key={idx}
                    onClick={() => insertMention(m.tag)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                      idx === mentionIndex
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-amber-400">@</span>
                      <span>{m.label}</span>
                    </span>
                    <span className="text-[9px] opacity-60 uppercase font-mono">
                      {m.type === 'region' ? 'Область' : 'Объект'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-500 italic px-1">
          Совет: Упоминайте <span className="text-amber-400 font-bold">@Область 1</span> прямо в тексте для точечной привязки.
        </p>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium flex items-center gap-2">
          <span className="material-symbols-outlined text-base flex-shrink-0">error_outline</span>
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isProcessing || !prompt.trim()}
        className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-900 disabled:text-zinc-600 rounded-2xl font-black text-white tracking-wider transition-all shadow-xl shadow-violet-600/25 active:scale-95 flex items-center justify-center gap-2 uppercase text-xs cursor-pointer whitespace-nowrap"
      >
        {isProcessing ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Редактирование...</span>
          </div>
        ) : (
          <>
            <span className="material-symbols-outlined text-base">auto_fix_high</span>
            <span>Отредактировать кадр</span>
          </>
        )}
      </button>
    </div>
  );
}