/**
 * Utility to blend a generated edit back onto the original image
 * strictly within specified bounding boxes, with multi-region support and soft feathering.
 */
export async function compositeMultiRegionEdit(
  originalBase64: string,
  generatedBase64: string,
  boxes: { originX: number; originY: number; width: number; height: number }[],
  mimeType: string = 'image/png'
): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      if (!boxes || boxes.length === 0) {
        resolve(generatedBase64);
        return;
      }

      const origImg = await loadImage(`data:${mimeType};base64,${originalBase64}`);
      const genImg = await loadImage(`data:${mimeType};base64,${generatedBase64}`);

      const canvas = document.createElement('canvas');
      canvas.width = origImg.naturalWidth;
      canvas.height = origImg.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(generatedBase64);
        return;
      }

      // 1. Draw original as background base layer (guarantees 100% preservation outside masks)
      ctx.drawImage(origImg, 0, 0);

      // 2. Prepare patch canvas for the generated image
      const patchCanvas = document.createElement('canvas');
      patchCanvas.width = canvas.width;
      patchCanvas.height = canvas.height;
      const pctx = patchCanvas.getContext('2d');
      if (!pctx) {
        resolve(generatedBase64);
        return;
      }
      pctx.drawImage(genImg, 0, 0, canvas.width, canvas.height);

      // 3. Create combined multi-region mask
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const mctx = maskCanvas.getContext('2d');
      if (mctx) {
        mctx.fillStyle = 'white';
        for (const box of boxes) {
          const feather = Math.max(3, Math.min(box.width, box.height) * 0.05);
          mctx.save();
          mctx.filter = `blur(${feather}px)`;
          mctx.fillRect(
            box.originX,
            box.originY,
            box.width,
            box.height
          );
          mctx.restore();
        }

        // Clip patch canvas with combined mask
        pctx.globalCompositeOperation = 'destination-in';
        pctx.drawImage(maskCanvas, 0, 0);
      }

      // 4. Blend the masked patch onto the original
      ctx.drawImage(patchCanvas, 0, 0);

      const finalBase64 = canvas.toDataURL(mimeType).split(',')[1];
      resolve(finalBase64);
    } catch (err) {
      console.error('Composite Multi-Region Error:', err);
      resolve(generatedBase64);
    }
  });
}

export async function compositeEdit(
  originalBase64: string,
  generatedBase64: string,
  box: { originX: number; originY: number; width: number; height: number },
  mimeType: string
): Promise<string> {
  return compositeMultiRegionEdit(originalBase64, generatedBase64, [box], mimeType);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function getFlowAspectRatio(w: number, h: number): '1:1' | '16:9' | '9:16' | '4:3' | '3:4' {
  const ratio = w / h;
  if (ratio > 1.5) return '16:9';
  if (ratio > 1.2) return '4:3';
  if (ratio < 0.6) return '9:16';
  if (ratio < 0.8) return '3:4';
  return '1:1';
}