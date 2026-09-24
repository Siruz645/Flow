/**
 * Google Flow SDK Bridge Client for Local Development.
 * Connects to local Bridge Server (http://127.0.0.1:3210) which relays
 * generation calls directly into an active Google Flow tab (flow.google.com).
 */

export interface FlowMediaItem {
  mediaId: string;
  base64: string;
  mimeType: string;
  name: string;
}

export interface FlowGenerateImageOptions {
  prompt: string;
  referenceImageMediaIds?: string[];
  referenceBase64?: string;
  referenceMimeType?: string;
  referenceBase64List?: string[];
  modelDisplayName?: string;
  aspectRatio?: string;
}

export interface FlowGenerateVideoOptions {
  prompt: string;
  modelDisplayName?: string;
  firstFrameImageMediaId?: string;
  firstFrameBase64?: string;
  firstFrameMimeType?: string;
  lastFrameImageMediaId?: string;
  lastFrameBase64?: string;
  lastFrameMimeType?: string;
  referenceImageMediaIds?: string[];
  referenceBase64List?: string[];
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
}

export interface BridgeStatus {
  online: boolean;
  flowTabsConnected: number;
  isFlowReady: boolean;
  message: string;
}

const BRIDGE_API = 'http://127.0.0.1:3210';
const mediaStore = new Map<string, FlowMediaItem>();

/**
 * Checks the health and connection status of the Flow Bridge.
 */
export async function checkBridgeStatus(): Promise<BridgeStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${BRIDGE_API}/api/bridge_status`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      online: true,
      flowTabsConnected: data.flow_tabs_connected || 0,
      isFlowReady: Boolean(data.is_flow_ready),
      message: data.is_flow_ready
        ? '🟢 Мост подключен к сессии Google Flow'
        : '🟡 Мост запущен, но вкладка flow.google.com не обнаружена'
    };
  } catch (err) {
    return {
      online: false,
      flowTabsConnected: 0,
      isFlowReady: false,
      message: '🔴 Bridge-сервер не запущен (127.0.0.1:3210)'
    };
  }
}

export const Flow = {
  media: {
    /**
     * Emulates Flow.media.select by opening a file picker on your PC.
     */
    async select(options?: { filter?: string }): Promise<FlowMediaItem | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = options?.filter === 'image' ? 'image/*' : '*/*';

        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const mimeType = file.type || 'image/png';
            const base64 = dataUrl.split(',')[1] || '';
            const item: FlowMediaItem = {
              mediaId: `local-media-${crypto.randomUUID()}`,
              base64,
              mimeType,
              name: file.name
            };
            mediaStore.set(item.mediaId, item);
            resolve(item);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        };

        input.oncancel = () => resolve(null);
        input.click();
      });
    }
  },

  generate: {
    /**
     * Generates an image using the live Google Flow Bridge (or fallback simulation if offline).
     */
    async image(options: FlowGenerateImageOptions): Promise<{ base64: string; mimeType: string; mediaId: string }> {
      console.log('[Flow SDK] 🎨 Flow.generate.image called with:', options);

      // 1. Try real generation through the Flow Bridge
      try {
        const bridgeStatus = await checkBridgeStatus();
        if (bridgeStatus.online && bridgeStatus.isFlowReady) {
          console.log('[Flow SDK] 🚀 Dispatching to active Google Flow tab via Bridge...');
          
          // Prepare reference base64 if provided
          let referenceBase64: string | undefined = options.referenceBase64;
          let referenceMimeType: string | undefined = options.referenceMimeType;
          let referenceBase64List: string[] = options.referenceBase64List ? [...options.referenceBase64List] : [];
          let referenceImageMediaIds: string[] = options.referenceImageMediaIds ? [...options.referenceImageMediaIds] : [];

          if (options.referenceImageMediaIds && options.referenceImageMediaIds.length > 0) {
            for (const refId of options.referenceImageMediaIds) {
              const refItem = mediaStore.get(refId);
              if (refItem && !refId.startsWith('local-media-') && !referenceImageMediaIds.includes(refId)) {
                referenceImageMediaIds.push(refId);
              } else if (refItem && !referenceBase64List.includes(refItem.base64)) {
                referenceBase64List.push(refItem.base64);
              }
            }
          }
          if (referenceBase64 && !referenceBase64List.includes(referenceBase64)) {
            referenceBase64List.unshift(referenceBase64);
          }

          const response = await fetch(`${BRIDGE_API}/api/generate_image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: options.prompt,
              aspectRatio: options.aspectRatio || '1:1',
              modelDisplayName: options.modelDisplayName || '🍌 Nano Banana Pro',
              referenceBase64,
              referenceMimeType,
              referenceBase64List,
              referenceImageMediaIds
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Bridge error (${response.status}): ${errText}`);
          }

          const result = await response.json();
          if (result.base64) {
            const genId = result.mediaId || `flow-gen-${crypto.randomUUID()}`;
            const item: FlowMediaItem = {
              mediaId: genId,
              base64: result.base64,
              mimeType: result.mimeType || 'image/png',
              name: `Flow Generated: ${options.prompt.slice(0, 30)}`
            };
            mediaStore.set(genId, item);
            console.log('[Flow SDK] 🎉 Real Flow generation received successfully! (mediaId: ' + genId + ')');
            return {
              mediaId: genId,
              base64: result.base64,
              mimeType: result.mimeType || 'image/png'
            };
          }
        } else {
          console.warn('[Flow SDK] ⚠️ Bridge or Flow tab not ready:', bridgeStatus.message);
        }
      } catch (bridgeErr: any) {
        console.warn('[Flow SDK] ⚠️ Bridge generation failed, falling back to local preview:', bridgeErr.message);
      }

      // 2. Fallback: Local Canvas preview if bridge/tab is not connected
      return createLocalFallbackImage(options);
    },

    /**
     * Generates a video using Google Flow Video models (Omni 1.1 Flash, Veo 3.1, etc.).
     * Supports Text-to-Video, Image-to-Video (First Frame), and Morphing (First + Last Frame).
     */
    async video(options: FlowGenerateVideoOptions): Promise<{ base64: string; mimeType: string; mediaId: string }> {
      console.log('[Flow SDK] 🎬 Flow.generate.video called with:', options);

      try {
        const bridgeStatus = await checkBridgeStatus();
        if (bridgeStatus.online && bridgeStatus.isFlowReady) {
          console.log('[Flow SDK] 🚀 Dispatching video generation to active Google Flow tab via Bridge...');

          // Resolve first frame
          let firstFrameImageMediaId = options.firstFrameImageMediaId;
          let firstFrameBase64 = options.firstFrameBase64;
          let firstFrameMimeType = options.firstFrameMimeType;
          if (firstFrameImageMediaId) {
            if (firstFrameImageMediaId.startsWith('local-media-')) {
              const item = mediaStore.get(firstFrameImageMediaId);
              if (item) {
                firstFrameBase64 = item.base64;
                firstFrameMimeType = item.mimeType;
                firstFrameImageMediaId = undefined;
              }
            }
          }

          // Resolve last frame
          let lastFrameImageMediaId = options.lastFrameImageMediaId;
          let lastFrameBase64 = options.lastFrameBase64;
          let lastFrameMimeType = options.lastFrameMimeType;
          if (lastFrameImageMediaId) {
            if (lastFrameImageMediaId.startsWith('local-media-')) {
              const item = mediaStore.get(lastFrameImageMediaId);
              if (item) {
                lastFrameBase64 = item.base64;
                lastFrameMimeType = item.mimeType;
                lastFrameImageMediaId = undefined;
              }
            }
          }

          let referenceBase64List: string[] = options.referenceBase64List ? [...options.referenceBase64List] : [];
          let referenceImageMediaIds: string[] = options.referenceImageMediaIds ? [...options.referenceImageMediaIds] : [];

          if (options.referenceImageMediaIds && options.referenceImageMediaIds.length > 0) {
            for (const refId of options.referenceImageMediaIds) {
              const item = mediaStore.get(refId);
              if (item && !refId.startsWith('local-media-') && !referenceImageMediaIds.includes(refId)) {
                referenceImageMediaIds.push(refId);
              } else if (item && !referenceBase64List.includes(item.base64)) {
                referenceBase64List.push(item.base64);
              }
            }
          }

          const response = await fetch(`${BRIDGE_API}/api/generate_video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: options.prompt,
              modelDisplayName: options.modelDisplayName || 'Omni 1.1 Flash',
              firstFrameBase64,
              firstFrameMimeType,
              firstFrameImageMediaId,
              lastFrameBase64,
              lastFrameMimeType,
              lastFrameImageMediaId,
              referenceBase64List,
              referenceImageMediaIds,
              aspectRatio: options.aspectRatio || '16:9',
              durationSeconds: options.durationSeconds ?? 5,
              resolution: options.resolution || '720p'
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Bridge video error (${response.status}): ${errText}`);
          }

          const result = await response.json();
          if (result.base64) {
            const genId = result.mediaId || `flow-vid-${crypto.randomUUID()}`;
            const item: FlowMediaItem = {
              mediaId: genId,
              base64: result.base64,
              mimeType: result.mimeType || 'video/mp4',
              name: `Flow Video: ${options.prompt.slice(0, 30)}`
            };
            mediaStore.set(genId, item);
            console.log('[Flow SDK] 🎥 Real Flow video generated successfully!');
            return {
              mediaId: genId,
              base64: result.base64,
              mimeType: result.mimeType || 'video/mp4'
            };
          } else {
            throw new Error(result.error || 'No video base64 returned');
          }
        } else {
          throw new Error('Bridge is offline or flow.google.com tab is not connected');
        }
      } catch (bridgeErr: any) {
        console.error('[Flow SDK] ❌ Video generation failed:', bridgeErr);
        throw bridgeErr;
      }
    },

    /**
     * Generates text or multimodal AI vision analysis via Google Flow.
     */
    async text(promptOrOptions: string | { prompt: string; images?: Array<{ base64: string; mimeType: string }> }): Promise<{ text: string }> {
      const prompt = typeof promptOrOptions === 'string' ? promptOrOptions : promptOrOptions.prompt;
      const images = typeof promptOrOptions === 'object' ? promptOrOptions.images : undefined;

      // If multimodal image analysis
      if (images && images.length > 0) {
        try {
          const res = await fetch(`${BRIDGE_API}/api/analyze_style`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64: images[0].base64,
              mimeType: images[0].mimeType || 'image/png'
            })
          });
          if (res.ok) {
            const data = await res.json();
            return {
              text: data.raw_text || JSON.stringify(data.style || {}, null, 2)
            };
          }
        } catch (err) {
          console.warn('[Flow SDK] text analyze_style request failed:', err);
        }
      }

      return {
        text: `Flow AI response for: ${prompt}`
      };
    }
  },

  camera: {
    /**
     * Captures a still snapshot from the user's webcam.
     */
    async capture(): Promise<{ base64: string; mimeType: string } | null> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);

        stream.getTracks().forEach(track => track.stop());
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        return {
          base64: dataUrl.split(',')[1],
          mimeType: 'image/jpeg'
        };
      } catch (e: any) {
        console.warn('[Flow SDK] Webcam capture failed or permission denied:', e.message);
        return null;
      }
    }
  },

  /**
   * Stores an edited or generated image in the media store.
   */
  async upload(options: { base64: string; mimeType: string; name?: string }): Promise<{ mediaId: string; base64: string; mimeType: string }> {
    console.log('[Flow SDK] 📤 Flow.upload called for:', options.name);
    const mediaId = `upload-${crypto.randomUUID()}`;
    const item: FlowMediaItem = {
      mediaId,
      base64: options.base64,
      mimeType: options.mimeType,
      name: options.name || 'Edited Image'
    };
    mediaStore.set(mediaId, item);
    return {
      mediaId,
      base64: options.base64,
      mimeType: options.mimeType
    };
  },

  /**
   * Triggers download of the image file to the local disk.
   */
  async download(options: { base64: string; mimeType: string; filename: string }) {
    console.log('[Flow SDK] 💾 Flow.download triggered:', options.filename);
    const a = document.createElement('a');
    a.href = `data:${options.mimeType};base64,${options.base64}`;
    a.download = options.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};

/**
 * Local Canvas fallback generator for when Flow tab is offline.
 */
function createLocalFallbackImage(options: FlowGenerateImageOptions): Promise<{ base64: string; mimeType: string; mediaId: string }> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Stylish gradient background
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.5, '#4338ca');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Grid accent lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1024; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, x);
      ctx.lineTo(1024, x);
      ctx.stroke();
    }

    // Status Card in center
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(112, 384, 800, 256, 24);
    ctx.fill();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎨 Flow Bridge Offline Preview', 512, 450);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Откройте flow.google.com в браузере с активным скриптом моста', 512, 495);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'italic 20px monospace';
    const cleanPrompt = options.prompt.length > 55 ? `${options.prompt.slice(0, 52)}...` : options.prompt;
    ctx.fillText(`"${cleanPrompt}"`, 512, 550);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '15px -apple-system, sans-serif';
    ctx.fillText(`Модель: ${options.modelDisplayName || 'Nano Banana Pro'} | Формат: ${options.aspectRatio || '1:1'}`, 512, 600);

    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const genId = `offline-${crypto.randomUUID()}`;
    resolve({
      mediaId: genId,
      base64,
      mimeType: 'image/png'
    });
  });
}
