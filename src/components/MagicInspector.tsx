import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Detection, Box } from '../App';

export interface RegionItem {
  id: string;
  name: string;
  box: Box;
  color?: string;
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
  isProcessing
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<Box | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    regionId: string;
    regionName: string;
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

  const handleRegionContextMenu = (e: React.MouseEvent, region: RegionItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      regionId: region.id,
      regionName: region.name
    });
  };

  return (
    <div className="relative flex flex-col items-center w-full h-full justify-center">
      {/* Status Tip */}
      <div className="mb-3 text-center flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-violet-400">
          {regions.length > 0 
            ? `Выделено областей: ${regions.length} • Правый клик для удаления`
            : detections.length > 0 
            ? "Выделите область рамкой или выберите объект" 
            : "Анализ изображения..."}
        </span>
      </div>

      <div 
        ref={containerRef}
        className="relative max-w-full max-h-full rounded-2xl overflow-hidden bg-zinc-950 shadow-[0_0_80px_rgba(139,92,246,0.15)] border border-white/10 cursor-crosshair group select-none"
        onMouseDown={handleMouseDown}
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
                onContextMenu={(e) => handleRegionContextMenu(e, region)}
              >
                {/* Region Tag Badge with Delete Cross */}
                <div className={`absolute -top-6 left-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg ${colorTheme.textBg}`}>
                  <span>@{region.name}</span>
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

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-[#14141f] border border-white/10 rounded-xl shadow-2xl p-1.5 min-w-[160px] animate-in fade-in zoom-in-95 duration-150 font-sans"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 border-b border-white/5 truncate">
            @{contextMenu.regionName}
          </div>
          <button
            onClick={() => {
              onDeleteRegion(contextMenu.regionId);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-xs font-bold text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            <span>Удалить область</span>
          </button>
        </div>
      )}
    </div>
  );
}