import React, { useState } from 'react';

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
  error 
}: Props) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    if (prompt.trim()) {
      onModify(prompt);
    }
  };

  const isManual = selectedElement?.includes('Область') || refinementIndex !== null;

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
            Smart Select
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest whitespace-nowrap">
            Точечное редактирование
          </p>
        </div>
      </div>

      {/* Target Element Display */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Выбранная область
          </span>
          {selectedElement && (
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-bold uppercase ${isManual ? 'text-emerald-400' : 'text-violet-400'}`}>
                Активно
              </span>
              <span className={`flex h-2 w-2 rounded-full ${isManual ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-violet-500 shadow-[0_0_10px_#8b5cf6]'}`} />
            </div>
          )}
        </div>
        
        <div className={`p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden group
          ${selectedElement 
            ? isManual ? 'bg-emerald-600/10 border-emerald-500/40' : 'bg-violet-600/10 border-violet-500/40'
            : 'bg-zinc-900/50 border-white/5'}`}>
          
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
              ${selectedElement ? (isManual ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-violet-500 shadow-violet-500/20') + ' text-white shadow-lg' : 'bg-zinc-800 text-slate-500'}`}>
              <span className="material-symbols-outlined text-xl">
                {isManual ? 'frame_inspect' : (selectedElement ? 'adjust' : 'image')}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className={`text-xs font-black tracking-tight truncate ${selectedElement ? 'text-white' : 'text-slate-400'}`}>
                {selectedElement || 'Весь кадр'}
              </span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                {isManual ? 'Ручная область' : (selectedElement ? 'Обнаруженный объект' : 'Глобальный фокус')}
              </span>
            </div>
          </div>
        </div>

        {/* Candidates Resolution */}
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

      {/* Prompt Input */}
      <div className="space-y-2">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
          Что изменить?
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={selectedElement ? `Напишите, что сделать с ${selectedElement}... (например: «замени на белую лошадь»)` : "Опишите изменения для изображения..."}
          className="w-full h-28 bg-zinc-900 border border-white/10 rounded-2xl p-4 text-xs font-medium focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-none placeholder:text-zinc-600 text-white leading-relaxed"
        />
        <p className="text-[10px] text-slate-500 italic px-1">
          Совет: Уточняйте детали, цвет и форму для максимального соответствия.
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