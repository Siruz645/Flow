import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Detection, Box } from '../App';

interface Props {
  media: any;
  detections: Detection[];
  selectedIndex: number | null;
  manualBox: Box | null;
  candidates: number[];
  refinementIndex: number | null;
  onSelect: (index: number | null) => void;
  onManualSelect: (box: Box | null) => void;
  isProcessing: boolean;
}

export function MagicInspector({ media, detections, selectedIndex, manualBox, candidates, refinementIndex, onSelect, onManualSelect, isProcessing }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<Box | null>(null);

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
  }, [media, detections, handleImgLoad]);

  const scaleX = imgSize.width / imgSize.naturalWidth;
  const scaleY = imgSize.height / imgSize.naturalHeight;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgRef.current || isProcessing) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentBox({ originX: x / scaleX, originY: y / scaleY, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !imgRef.current) return;
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

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentBox && currentBox.width > 5 && currentBox.height > 5) {
      onManualSelect(currentBox);
    }
    setCurrentBox(null);
  };

  return (
    <div className="relative flex flex-col items-center w-full">
      <div className="mb-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400/80 animate-pulse">
          {manualBox 
            ? "Область выделена • Уточните объект справа" 
            : detections.length > 0 ? "Нажмите на объект или выделите область" : "Загрузка анализатора..."}
        </p>
      </div>

      <div 
        ref={containerRef}
        className="relative max-w-full max-h-full rounded-2xl overflow-hidden bg-zinc-950 shadow-[0_0_80px_rgba(139,92,246,0.15)] border border-white/5 cursor-crosshair group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img 
          ref={imgRef}
          src={`data:${media.mimeType};base64,${media.base64}`}
          alt="Original"
          className="block max-w-full max-h-[60vh] object-contain select-none pointer-events-none"
          onLoad={handleImgLoad}
          draggable={false}
        />
        
        {/* Detection Boxes */}
        <div className="absolute inset-0 pointer-events-none">
          {detections.map((d, i) => {
            const left = d.boundingBox.originX * scaleX;
            const top = d.boundingBox.originY * scaleY;
            const width = d.boundingBox.width * scaleX;
            const height = d.boundingBox.height * scaleY;
            
            const isSelected = selectedIndex === i;
            const isCandidate = candidates.includes(i);
            const isRefined = refinementIndex === i;

            // Don't show regular boxes if we are in manual mode unless it's a candidate
            if (manualBox && !isCandidate) return null;

            return (
              <div
                key={i}
                className={`absolute transition-all duration-300 pointer-events-auto cursor-pointer
                  ${isSelected || isRefined
                    ? 'border-2 border-violet-400 bg-violet-500/10 z-30 shadow-[0_0_30px_rgba(139,92,246,0.4)]' 
                    : isCandidate 
                      ? 'border border-emerald-400/40 bg-emerald-500/5 z-20'
                      : 'border border-white/20 hover:border-violet-400/60 hover:bg-violet-500/5 z-10'
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
                <div className={`absolute -top-7 left-0 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wider transition-all
                  ${isSelected || isRefined ? 'bg-violet-500 text-white opacity-100' : 'bg-black/80 text-white/60 opacity-0 group-hover:opacity-100'}`}>
                  {d.label}
                </div>
              </div>
            );
          })}

          {/* Active Manual Box */}
          {manualBox && (
            <div
              className="absolute border-2 border-dashed border-emerald-400/50 bg-emerald-500/5 z-40"
              style={{
                left: `${manualBox.originX * scaleX}px`,
                top: `${manualBox.originY * scaleY}px`,
                width: `${manualBox.width * scaleX}px`,
                height: `${manualBox.height * scaleY}px`,
              }}
            >
              <div className="absolute -top-7 left-0 px-2 py-1 rounded-md bg-emerald-500 text-black text-[8px] font-black uppercase tracking-wider">
                Область выбора
              </div>
            </div>
          )}

          {/* Drawing Preview */}
          {currentBox && (
            <div
              className="absolute border-2 border-violet-400 bg-violet-500/5 z-50"
              style={{
                left: `${currentBox.originX * scaleX}px`,
                top: `${currentBox.originY * scaleY}px`,
                width: `${currentBox.width * scaleX}px`,
                height: `${currentBox.height * scaleY}px`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}