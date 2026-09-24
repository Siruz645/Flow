import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Detection, Box } from '../App';
import { RegionStyle } from './StyleModal';

export interface RegionItem {
  id: string;
  name: string;
  box: Box;
  color?: string;
  style?: RegionStyle | null;
}

interface Props {
  media: any;
  detections: Detection[];
  selectedIndex: number | null;
  regions: RegionItem[];
  selectedRegionId: string | null;
  onSelect: (index: number | null) => void;
  onAddRegion: (box: Box) => void;
  onDeleteRegion: (id: string) => void;
  onSelectRegion: (id: string | null) => void;
  onOpenStyleModal: (region: RegionItem) => void;
  isProcessing: boolean;
}

const REGION_COLORS = [
  { border: 'border-amber-400', bg: 'bg-amber-500/10', textBg: 'bg-amber-500 text-black', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.3)]' },
  { border: 'border-emerald-400', bg: 'bg-emerald-500/10', textBg: 'bg-emerald-500 text-black', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.3)]' },
  { border: 'border-cyan-400', bg: 'bg-cyan-500/10', textBg: 'bg-cyan-500 text-black', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.3)]' },
  { border: 'border-fuchsia-400', bg: 'bg-fuchsia-500/10', textBg: 'bg-fuchsia-500 text-white', glow: 'shadow-[0_0_20px_rgba(232,121,249,0.3)]' },
  { border: 'border-rose-400', bg: 'bg-rose-500/10', textBg: 'bg-rose-500 text-white', glow: 'shadow-[0_0_20px_rgba(251,113,133,0.3)]' },
];

export function MagicInspector({
  media,
  detections,
  selectedIndex,
  regions,
  selectedRegionId,
  onSelect,
  onAddRegion,
  onDeleteRegion,
  onSelectRegion,
  onOpenStyleModal,
  isProcessing
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<Box | null>(null);

  // Context Menu State for Multi-Region Selection
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetRegions: RegionItem[];
  } | null>(null);

  const handleImgLoad = useCallback(() => {
    if (imgRef.current) {
      const { width, height, naturalWidth, naturalHeight } = imgRef.current;
      setImgSize({ width, height, naturalWidth, naturalHeight });
    }
  }, []);

  useEffect(() => {
    const handleResize = () => handleImgLoad();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleImgLoad]);

  useEffect(() => {
    handleImgLoad();
  }, [media, detections, regions, handleImgLoad]);

  // Close context menu on global click
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const scaleX = imgSize.naturalWidth ? imgSize.width / imgSize.naturalWidth : 1;
  const scaleY = imgSize.naturalHeight ? imgSize.height / imgSize.naturalHeight : 1;

  // Window-level mouse handling during drawing to avoid premature commits on mouseleave
  useEffect(() => {
    if (!isDrawing) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      const originX = Math.min(x, startPos.x);
      const originY = Math.min(y, startPos.y);
      const width = Math.abs(x - startPos.x);
      const height = Math.abs(y - startPos.y);

      setCurrentBox({
        originX: originX / scaleX,
        originY: originY / scaleY,
        width: width / scaleX,
        height: height / scaleY
      });
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (!imgRef.current) {
        setIsDrawing(false);
        setCurrentBox(null);
        return;
      }
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      const originX = Math.min(x, startPos.x);
      const originY = Math.min(y, startPos.y);
      const width = Math.abs(x - startPos.x);
      const height = Math.abs(y - startPos.y);

      const finalBox: Box = {
        originX: originX / scaleX,
        originY: originY / scaleY,
        width: width / scaleX,
        height: height / scaleY
      };

      setIsDrawing(false);
      // Require at least 15px width/height to avoid accidental micro-clicks
      if (finalBox.width > 15 && finalBox.height > 15) {
        onAddRegion(finalBox);
      }
      setCurrentBox(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDrawing, startPos, scaleX, scaleY, onAddRegion]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start drawing on Left Click (button === 0)
    if (e.button !== 0 || !imgRef.current || isProcessing) return;
    setContextMenu(null);

    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentBox({ originX: x / scaleX, originY: y / scaleY, width: 0, height: 0 });
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    if (!imgRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const matched = regions.filter(r => {
      const left = r.box.originX * scaleX;
      const top = r.box.originY * scaleY;
      const width = r.box.width * scaleX;
      const height = r.box.height * scaleY;
      return x >= left && x <= left + width && y >= top && y <= top + height;
    });

    if (matched.length > 0) {
      setContextMenu({
        x: Math.min(e.clientX, window.innerWidth - 260),
        y: Math.min(e.clientY, window.innerHeight - 320),
        targetRegions: matched
      });
    } else {
      setContextMenu(null);
    }
  };

  return (
    <div className="relative flex flex-col items-center w-full h-full justify-center">
      {/* Status Tip */}
      <div className="mb-3 text-center flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-violet-400">
          {regions.length > 0 
            ? `Выделено областей: ${regions.length} • Правый клик для меню / стиля`
            : detections.length > 0 
            ? "Выделите область рамкой или выберите объект" 
            : "Анализ изображения..."}
        </span>
      </div>

      <div 
        ref={containerRef}
        className="relative max-w-full max-h-full rounded-2xl overflow-hidden bg-zinc-950 shadow-[0_0_80px_rgba(139,92,246,0.15)] border border-white/10 cursor-crosshair group select-none"
        onMouseDown={handleMouseDown}
        onContextMenu={handleCanvasContextMenu}
      >
        <img 
          ref={imgRef}
          src={`data:${media.mimeType};base64,${media.base64}`}
          alt="Original"
          className="block max-w-full max-h-[60vh] object-contain select-none pointer-events-none"
          onLoad={handleImgLoad}
          draggable={false}
        />
        
        {/* Detection Boxes (AI recognized) */}
        <div className="absolute inset-0 pointer-events-none">
          {detections.map((d, i) => {
            const left = d.boundingBox.originX * scaleX;
            const top = d.boundingBox.originY * scaleY;
            const width = d.boundingBox.width * scaleX;
            const height = d.boundingBox.height * scaleY;
            
            const isSelected = selectedIndex === i;

            return (
              <div
                key={`det-${i}`}
                className={`absolute transition-all duration-200 pointer-events-auto cursor-pointer
                  ${isSelected
                    ? 'border-2 border-violet-400 bg-violet-500/15 z-30 shadow-[0_0_25px_rgba(139,92,246,0.5)]' 
                    : 'border border-white/25 hover:border-violet-400/80 hover:bg-violet-500/10 z-10'
                  }`}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSelected ? null : i);
                }}
              >
                <div className={`absolute -top-6 left-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all
                  ${isSelected ? 'bg-violet-500 text-white opacity-100 shadow-md' : 'bg-black/80 text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                  {d.label}
                </div>
              </div>
            );
          })}

          {/* User-Drawn Manual Regions */}
          {regions.map((region, idx) => {
            const colorTheme = REGION_COLORS[idx % REGION_COLORS.length];
            const isSelected = selectedRegionId === region.id;
            const left = region.box.originX * scaleX;
            const top = region.box.originY * scaleY;
            const width = region.box.width * scaleX;
            const height = region.box.height * scaleY;

            return (
              <div
                key={region.id}
                className={`absolute border-2 transition-all duration-200 pointer-events-auto cursor-pointer z-40 group/box ${colorTheme.border} ${colorTheme.bg} ${isSelected ? colorTheme.glow + ' ring-2 ring-white/50' : ''}`}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRegion(isSelected ? null : region.id);
                }}
                onContextMenu={handleCanvasContextMenu}
              >
                {/* Region Tag Badge with Style and Delete Action */}
                <div className={`absolute -top-6 left-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg ${colorTheme.textBg}`}>
                  <span>@{region.name}</span>
                  {region.style && (
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenStyleModal(region);
                      }}
                      className="bg-black/40 text-amber-300 px-1 py-0.2 rounded text-[8px] flex items-center gap-0.5 cursor-pointer hover:bg-black/60 truncate max-w-[90px]" 
                      title={`Стиль: ${region.style.name}. Нажмите для изменения`}
                    >
                      <span>🎨</span>
                      <span className="truncate">{region.style.name}</span>
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenStyleModal(region);
                    }}
                    title="Настроить стиль для этой области"
                    className="hover:bg-black/30 rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold text-[9px] leading-none transition-colors"
                  >
                    🎨
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRegion(region.id);
                    }}
                    title="Удалить область"
                    className="hover:bg-black/30 rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold text-[10px] leading-none transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          {/* Active Drawing Box Preview */}
          {currentBox && (
            <div
              className="absolute border-2 border-dashed border-amber-400 bg-amber-500/10 z-50 pointer-events-none"
              style={{
                left: `${currentBox.originX * scaleX}px`,
                top: `${currentBox.originY * scaleY}px`,
                width: `${currentBox.width * scaleX}px`,
                height: `${currentBox.height * scaleY}px`,
              }}
            >
              <div className="absolute -top-6 left-0 px-2 py-0.5 rounded-md bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider">
                Выделение...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Region Right-Click Context Menu */}
      {contextMenu && contextMenu.targetRegions.length > 0 && (
        <div
          className="fixed z-[100] bg-[#14141f] border border-white/10 rounded-2xl shadow-2xl p-2 min-w-[240px] max-w-[300px] animate-in fade-in zoom-in-95 duration-150 font-sans divide-y divide-white/5 backdrop-blur-xl"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
            <span>Области в этой точке ({contextMenu.targetRegions.length})</span>
            <button 
              onClick={() => setContextMenu(null)}
              className="text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          <div className="py-1 space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
            {contextMenu.targetRegions.map((reg, rIdx) => {
              const theme = REGION_COLORS[regions.findIndex(r => r.id === reg.id) % REGION_COLORS.length] || REGION_COLORS[0];
              return (
                <div 
                  key={reg.id} 
                  className="p-2 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                      <span className={`w-2 h-2 rounded-full ${theme.bg.replace('/10', '')} border ${theme.border}`} />
                      <span>@{reg.name}</span>
                    </span>
                    {reg.style ? (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 truncate max-w-[100px]" title={reg.style.name}>
                        🎨 {reg.style.name}
                      </span>
                    ) : (
                      <span className="text-[8px] text-slate-500 font-mono">Без стиля</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1 pt-0.5">
                    <button
                      onClick={() => {
                        onOpenStyleModal(reg);
                        setContextMenu(null);
                      }}
                      className="px-2 py-1.5 text-[10px] font-bold text-violet-300 hover:text-white bg-violet-600/20 hover:bg-violet-600/40 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border border-violet-500/20"
                    >
                      <span className="text-[11px]">🎨</span>
                      <span>{reg.style ? 'Сменить стиль' : 'Стиль'}</span>
                    </button>
                    <button
                      onClick={() => {
                        onDeleteRegion(reg.id);
                        if (contextMenu.targetRegions.length === 1) {
                          setContextMenu(null);
                        } else {
                          setContextMenu(prev => prev ? {
                            ...prev,
                            targetRegions: prev.targetRegions.filter(r => r.id !== reg.id)
                          } : null);
                        }
                      }}
                      className="px-2 py-1.5 text-[10px] font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/30 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border border-red-500/20"
                    >
                      <span className="material-symbols-outlined text-[12px]">delete</span>
                      <span>Удалить</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {contextMenu.targetRegions.length > 1 && (
            <div className="pt-1.5">
              <button
                onClick={() => {
                  contextMenu.targetRegions.forEach(r => onDeleteRegion(r.id));
                  setContextMenu(null);
                }}
                className="w-full text-center px-3 py-1.5 text-[10px] font-bold text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xs">delete_sweep</span>
                <span>Удалить все {contextMenu.targetRegions.length} области</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}