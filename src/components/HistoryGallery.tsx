import React from 'react';
import { HistoryItem } from '../App';

interface Props {
  items: HistoryItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function HistoryGallery({ items, activeIndex, onSelect }: Props) {
  return (
    <div className="w-full bg-[#0d0d12] border-b border-white/5 py-3 px-4 flex items-center gap-4 overflow-x-auto no-scrollbar scroll-smooth shadow-lg z-20">
      <div className="flex-shrink-0 flex items-center gap-2 pr-4 border-r border-white/5">
        <span className="material-symbols-outlined text-slate-600 text-lg">history</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">История</span>
      </div>
      
      <div className="flex gap-3 h-14">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => onSelect(index)}
            className={`group relative flex-shrink-0 h-full aspect-square rounded-xl overflow-hidden transition-all duration-300 border-2 cursor-pointer
              ${activeIndex === index 
                ? 'border-violet-500 scale-105 shadow-[0_0_15px_rgba(139,92,246,0.3)]' 
                : 'border-white/5 opacity-50 hover:opacity-100 hover:border-white/20'}`}
          >
            <img 
              src={`data:${item.mimeType};base64,${item.base64}`} 
              alt={item.name} 
              className="w-full h-full object-cover"
            />
            {activeIndex === index && (
              <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-xs">check_circle</span>
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/80 py-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[6px] font-black uppercase text-white truncate block">
                {index === 0 ? 'Оригинал' : `v${index}`}
              </span>
            </div>
          </button>
        ))}
      </div>
      
      <div className="flex-shrink-0 px-2">
        <div className="h-4 w-[1px] bg-white/10" />
      </div>
      
      <p className="flex-shrink-0 text-[10px] font-bold text-slate-600 uppercase tracking-tighter italic">
        {items.length} {items.length === 1 ? 'версия' : 'версий'} в потоке
      </p>
    </div>
  );
}