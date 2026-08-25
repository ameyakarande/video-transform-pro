import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ObjectFitMode, OutputFormat, OverlayItem, SubtitleItem } from '../types/editor';

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg;
  const instance = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await instance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpeg = instance;
  return instance;
}

export interface ProcessOptions {
  startTime: number;
  endTime: number;
  format: OutputFormat;
  speed?: number;
  isMuted?: boolean;
  bgMusicFile?: File | null;
  lutFiles?: File[];
  overlays?: OverlayItem[];
  subtitles?: SubtitleItem[];
  objectFit?: ObjectFitMode;
}

const outputSize = (format: OutputFormat) => format === 'youtube'
  ? { width: 1920, height: 1080 }
  : { width: 720, height: 1280 };

async function renderTextOverlay(overlay: OverlayItem, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable for text export.');
  const fontSize = Math.max(24, Math.round(height * (overlay.height / 100) * 0.65));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.85)';
  ctx.shadowBlur = Math.max(4, Math.round(fontSize * 0.18));
  ctx.fillText(overlay.content, width * overlay.x / 100, height * overlay.y / 100, width * overlay.width / 100);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not render text overlay.')),
    'image/png',
  ));
}

function srtTimestamp(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export async function processVideo(
  videoFile: File,
  options: ProcessOptions,
  onProgress?: (progress: number) => void,
) {
  const instance = await loadFFmpeg();
  const {
    startTime, endTime, format, speed = 1, isMuted = false,
    bgMusicFile, lutFiles = [], overlays = [], subtitles = [], objectFit = 'cover',
  } = options;
  if (endTime <= startTime) throw new Error('The trim end must be after the start.');

  const progressHandler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  instance.on('progress', progressHandler);
  const runId = Date.now().toString(36);
  const inputName = `input-${runId}.mp4`;
  const outputName = `output-${runId}.mp4`;
  const createdFiles = [inputName, outputName];
  const { width, height } = outputSize(format);

  try {
    await instance.writeFile(inputName, await fetchFile(videoFile));
    const args = ['-ss', String(startTime), '-t', String(endTime - startTime), '-i', inputName];
    let nextInput = 1;
    let bgMusicIndex: number | null = null;

    if (bgMusicFile) {
      const name = `music-${runId}`;
      createdFiles.push(name);
      await instance.writeFile(name, await fetchFile(bgMusicFile));
      args.push('-stream_loop', '-1', '-i', name);
      bgMusicIndex = nextInput++;
    }

    const overlayInputs: Array<{ overlay: OverlayItem; index: number; fullFrame: boolean }> = [];
    for (let index = 0; index < overlays.length; index += 1) {
      const overlay = overlays[index];
      const name = `overlay-${runId}-${index}.${overlay.type === 'video' ? 'mp4' : 'png'}`;
      createdFiles.push(name);
      if (overlay.type === 'text') {
        await instance.writeFile(name, await fetchFile(await renderTextOverlay(overlay, width, height)));
      } else {
        await instance.writeFile(name, await fetchFile(overlay.file || overlay.content));
      }
      if (overlay.type === 'video') args.push('-stream_loop', '-1', '-i', name);
      else args.push('-loop', '1', '-i', name);
      overlayInputs.push({ overlay, index: nextInput++, fullFrame: overlay.type === 'text' });
    }

    const filters: string[] = [];
    const baseScale = objectFit === 'cover'
      ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    const videoFilters = [baseScale];
    if (speed !== 1) videoFilters.push(`setpts=${1 / speed}*PTS`);
    for (let index = 0; index < lutFiles.length; index += 1) {
      const name = `lut-${runId}-${index}.cube`;
      createdFiles.push(name);
      await instance.writeFile(name, await fetchFile(lutFiles[index]));
      videoFilters.push(`lut3d=${name}`);
    }
    filters.push(`[0:v]${videoFilters.join(',')}[base]`);
    let currentVideo = 'base';

    overlayInputs.forEach(({ overlay, index, fullFrame }, overlayNumber) => {
      const prepared = `ov${overlayNumber}`;
      if (fullFrame) filters.push(`[${index}:v]scale=${width}:${height}[${prepared}]`);
      else filters.push(`[${index}:v]scale=${Math.max(2, Math.round(width * overlay.width / 100))}:${Math.max(2, Math.round(height * overlay.height / 100))}[${prepared}]`);
      const output = `vo${overlayNumber}`;
      const from = Math.max(0, overlay.startTime - startTime) / speed;
      const to = Math.max(from, Math.min(endTime, overlay.endTime) - startTime) / speed;
      const x = fullFrame ? 0 : `W*${overlay.x / 100}-w/2`;
      const y = fullFrame ? 0 : `H*${overlay.y / 100}-h/2`;
      filters.push(`[${currentVideo}][${prepared}]overlay=${x}:${y}:enable='between(t,${from},${to})':eof_action=pass[${output}]`);
      currentVideo = output;
    });

    if (subtitles.length > 0) {
      const subtitleName = `subtitles-${runId}.srt`;
      createdFiles.push(subtitleName);
      const visible = subtitles
        .filter((item) => item.end > startTime && item.start < endTime)
        .map((item, index) => `${index + 1}\n${srtTimestamp((Math.max(item.start, startTime) - startTime) / speed)} --> ${srtTimestamp((Math.min(item.end, endTime) - startTime) / speed)}\n${item.text}\n`)
        .join('\n');
      await instance.writeFile(subtitleName, new TextEncoder().encode(visible));
      filters.push(`[${currentVideo}]subtitles=${subtitleName}:force_style='Alignment=2,MarginV=80,FontSize=24,Outline=2'[subbed]`);
      currentVideo = 'subbed';
    }

    let currentAudio: string | null = isMuted ? null : '0:a';
    if (currentAudio && speed !== 1) {
      filters.push(`[${currentAudio}]atempo=${speed}[originalAudio]`);
      currentAudio = 'originalAudio';
    }
    if (bgMusicIndex !== null) {
      if (currentAudio) {
        filters.push(`[${currentAudio}][${bgMusicIndex}:a]amix=inputs=2:duration=first:dropout_transition=2[mixedAudio]`);
        currentAudio = 'mixedAudio';
      } else currentAudio = `${bgMusicIndex}:a`;
    }

    args.push('-filter_complex', filters.join(';'), '-map', `[${currentVideo}]`);
    if (currentAudio) args.push('-map', currentAudio.includes(':') ? `${currentAudio}?` : `[${currentAudio}]`, '-c:a', 'aac');
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-movflags', '+faststart', '-shortest', outputName);
    const exitCode = await instance.exec(args);
    if (exitCode !== 0) throw new Error(`FFmpeg export failed with code ${exitCode}.`);
    const data = await instance.readFile(outputName);
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  } finally {
    instance.off('progress', progressHandler);
    await Promise.all(createdFiles.map((name) => instance.deleteFile(name).catch(() => undefined)));
  }
}
