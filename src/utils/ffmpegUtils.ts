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
}

export async function processVideo(
  videoFile: File,
  options: ProcessOptions,
  onProgress?: (progress: number) => void
) {
  const instance = await loadFFmpeg();
  const { startTime, endTime, format } = options;

  if (onProgress) {
    instance.on('progress', ({ progress }) => {
      onProgress(progress);
    });
  }

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  // Write file to virtual FS
  await instance.writeFile(inputName, await fetchFile(videoFile));

  // Build FFmpeg command
  // YouTube = 16:9 (standard usually)
  // Instagram = 9:16 (vertical)
  
  
  const args = [
    '-ss', startTime.toString(),
    '-to', endTime.toString(),
    '-i', inputName,
  ];

  if (format === 'instagram') {
    // Crop for 9:16
    // Formula: crop=ih*9/16:ih forces height to stay and width to fit 9:16
    args.push('-vf', 'crop=ih*9/16:ih,scale=720:1280');
  } else {
    // Ensure 16:9 1080p for YouTube
    args.push('-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
  }

  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy', outputName);

  await instance.exec(args);

  const data = await instance.readFile(outputName);
  // data can be SharedArrayBuffer in some environments, MUST be copied to regular Uint8Array for Blob
  const finalData = new Uint8Array(data.length);
  finalData.set(data as Uint8Array);
  return new Blob([finalData], { type: 'video/mp4' });
}
