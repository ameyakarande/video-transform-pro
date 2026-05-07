import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

export interface ProcessOptions {
  startTime: number;
  endTime: number;
  format: 'youtube' | 'instagram';
  speed?: number;
  isMuted?: boolean;
  bgMusicFile?: File | null;
  textOverlayDataUrl?: string;
  lutFiles?: File[];
  overlays?: any[];
  subtitles?: any[];
}

export async function processVideo(
  videoFile: File,
  options: ProcessOptions,
  onProgress?: (progress: number) => void
) {
  const instance = await loadFFmpeg();
  const { 
    startTime, endTime, format, 
    speed = 1, isMuted = false, 
    bgMusicFile, textOverlayDataUrl,
    lutFiles = [],
    overlays = [],
  } = options;

  if (onProgress) {
    instance.on('progress', ({ progress }) => {
      onProgress(progress);
    });
  }

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  // Write files to virtual FS
  await instance.writeFile(inputName, await fetchFile(videoFile));

  const args = [
    '-ss', startTime.toString(),
    '-to', endTime.toString(),
    '-i', inputName,
  ];

  let inputIndex = 1;

  if (bgMusicFile) {
    await instance.writeFile('bgmusic.mp3', await fetchFile(bgMusicFile));
    args.push('-i', 'bgmusic.mp3');
    inputIndex++;
  }

  if (textOverlayDataUrl) {
    const res = await fetch(textOverlayDataUrl);
    const blob = await res.blob();
    await instance.writeFile('text.png', await fetchFile(blob));
    args.push('-i', 'text.png');
  }

  // --- Filter Graph Construction ---
  const complexFilters: string[] = [];
  const videoFilters: string[] = [];
  
  if (format === 'instagram') {
    videoFilters.push('crop=ih*9/16:ih', 'scale=720:1280');
  } else {
    videoFilters.push('scale=1920:1080:force_original_aspect_ratio=decrease', 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
  }

  if (speed !== 1) {
    // Note: setpts slows down by dividing PTS (speed=0.5 -> 2.0*PTS)
    videoFilters.push(`setpts=${1/speed}*PTS`);
  }

  // --- LUTs ---
  if (lutFiles.length > 0) {
    for (let i = 0; i < lutFiles.length; i++) {
      const lutName = `lut${i}.cube`;
      await instance.writeFile(lutName, await fetchFile(lutFiles[i]));
      videoFilters.push(`lut3d=${lutName}`);
    }
  }

  let currentVidLabel = '0:v';
  if (videoFilters.length > 0) {
    complexFilters.push(`[0:v]${videoFilters.join(',')}[v1]`);
    currentVidLabel = 'v1';
  }

  // --- Overlays (Simplified for now: sequential) ---
  if (overlays.length > 0) {
    for (let i = 0; i < overlays.length; i++) {
        const ov = overlays[i];
        if (ov.type === 'text') {
            // Re-use current logic for a single rendered overlay or use drawtext
            // For simplicity and matching preview, we can use drawtext if we have font
            // But let's assume we render each overlay to PNG in App.tsx before calling this
            // We'll skip complex multiple-assets export for this POC unless requested
        }
    }
  }

  let currentAudioLabel: string | null = isMuted ? null : '0:a';
  if (currentAudioLabel && speed !== 1) {
    complexFilters.push(`[${currentAudioLabel}]atempo=${speed}[a1]`);
    currentAudioLabel = 'a1';
  }

  if (bgMusicFile) {
    const bgIdx = 1;
    if (currentAudioLabel) {
      complexFilters.push(`[${currentAudioLabel}][${bgIdx}:a]amix=inputs=2:duration=first[aout]`);
      currentAudioLabel = 'aout';
    } else {
      currentAudioLabel = `${bgIdx}:a`;
    }
  }

  if (complexFilters.length > 0) {
    args.push('-filter_complex', complexFilters.join(';'));
  }

  args.push('-map', currentVidLabel.includes(':') ? currentVidLabel : `[${currentVidLabel}]`);
  
  if (currentAudioLabel) {
    // The ? makes it skip silently if original video has no audio track
    args.push('-map', currentAudioLabel.includes(':') ? `${currentAudioLabel}?` : `[${currentAudioLabel}]`);
    args.push('-c:a', 'aac');
  }

  args.push('-c:v', 'libx264', '-preset', 'ultrafast', outputName);

  console.log("Executing FFmpeg command:", args.join(' '));
  await instance.exec(args);

  const data = await instance.readFile(outputName);
  const finalData = new Uint8Array(data.length);
  finalData.set(data as Uint8Array);
  return new Blob([finalData], { type: 'video/mp4' });
}
