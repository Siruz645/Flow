import { useState, useEffect } from 'react';
import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

export function useObjectDetector() {
  const [detector, setDetector] = useState<ObjectDetector | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        // Use the specific CDN path required for the sandboxed environment
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
        );
        
        if (!active) return;

        const objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite`,
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          scoreThreshold: 0.15,
          maxResults: 15,
        });
        
        if (active) {
          setDetector(objectDetector);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('MediaPipe Init Error:', err);
        if (active) {
          setError('Failed to load object analyzer. Please check your connection.');
          setIsLoading(false);
        }
      }
    }
    
    init();

    return () => {
      active = false;
      detector?.close();
    };
  }, []);

  return { detector, isLoading, error };
}