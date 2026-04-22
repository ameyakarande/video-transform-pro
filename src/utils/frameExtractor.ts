export async function extractFrames(
  file: File,
  frameCount: number = 8,
  quality: number = 0.5
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const url = URL.createObjectURL(file);
    const frames: string[] = [];

    video.muted = true;
    video.crossOrigin = 'anonymous';
    // Essential for fast seeking without playing
    video.preload = 'metadata';

    if (!ctx) {
      reject(new Error("Unable to create canvas context"));
      return;
    }

    video.onloadeddata = () => {
      // Small resolution for thumbnail speed
      const targetHeight = 60;
      const aspect = video.videoWidth / video.videoHeight || 1;
      const targetWidth = Math.floor(targetHeight * aspect);
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const duration = video.duration || 0;
      if (duration === 0) {
        URL.revokeObjectURL(url);
        resolve([]);
        return;
      }

      // Generate times to capture
      const times: number[] = [];
      const interval = duration / frameCount;
      for (let i = 0; i < frameCount; i++) {
        // Sample slightly offset from exactly 0 edge cases
        times.push(interval * i + interval * 0.5);
      }

      let currentIndex = 0;

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          console.error("Frame capture error:", e);
          // push empty or failure
        }
        
        currentIndex++;
        if (currentIndex < times.length) {
          video.currentTime = times[currentIndex];
        } else {
          // Done
          URL.revokeObjectURL(url);
          resolve(frames);
        }
      };

      // Start the extraction loop
      video.currentTime = times[currentIndex];
    };

    video.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    video.src = url;
    video.load();
  });
}
