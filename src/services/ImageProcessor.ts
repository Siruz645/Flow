/**
 * Utility to blend a generated edit back onto the original image
 * strictly within a specified bounding box, with optional feathering.
 */
export async function compositeEdit(
  originalBase64: string,
  generatedBase64: string,
  box: { originX: number; originY: number; width: number; height: number },
  mimeType: string
): Promise<string> {
  return new Promise(async (resolve) => {
    try {
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

      // 1. Draw original as base
      ctx.drawImage(origImg, 0, 0);

      // 2. Create a temporary canvas for the masked patch
      const patchCanvas = document.createElement('canvas');
      patchCanvas.width = canvas.width;
      patchCanvas.height = canvas.height;
      const pctx = patchCanvas.getContext('2d');
      if (!pctx) {
        resolve(generatedBase64);
        return;
      }

      // Draw the generated image scaled to the original dimensions
      // This ensures spatial alignment if the model shifted things
      pctx.drawImage(genImg, 0, 0, canvas.width, canvas.height);

      // 3. Create the mask (the "hole" where we want the new pixels)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const mctx = maskCanvas.getContext('2d');
      if (mctx) {
        const feather = Math.max(5, Math.min(box.width, box.height) * 0.12);
        
        mctx.fillStyle = 'white';
        // Apply filter to context BEFORE drawing
        mctx.filter = `blur(${feather}px)`;
        
        // Draw slightly smaller to account for blur bleed
        mctx.fillRect(
          box.originX + feather, 
          box.originY + feather, 
          box.width - feather * 2, 
          box.height - feather * 2
        );

        // Apply mask to patch using destination-in
        pctx.globalCompositeOperation = 'destination-in';
        pctx.drawImage(maskCanvas, 0, 0);
      }

      // 4. Draw the feathered patch onto the original
      ctx.drawImage(patchCanvas, 0, 0);

      const finalBase64 = canvas.toDataURL(mimeType).split(',')[1];
      resolve(finalBase64);
    } catch (err) {
      console.error('Composite Error:', err);
      resolve(generatedBase64);
    }
  });
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