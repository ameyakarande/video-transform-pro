import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ObjectFitMode, OutputFormat, OverlayItem, SubtitleItem } from '../types/editor';
import type { AnalyzedClip, StoryShot } from '../types/autoEdit';

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
  ctx.font = `${overlay.fontStyle || 'normal'} ${overlay.fontWeight || 'bold'} ${overlay.fontSize || fontSize}px ${overlay.fontFamily || 'sans-serif'}`;
  ctx.fillStyle = overlay.color || '#fff';
  ctx.textAlign = overlay.textAlign || 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.85)';
  ctx.shadowBlur = Math.max(4, Math.round(fontSize * 0.18));
  const boxWidth = width * overlay.width / 100;
  const boxHeight = height * overlay.height / 100;
  const left = width * overlay.x / 100 - boxWidth / 2;
  const top = height * overlay.y / 100 - boxHeight / 2;
  if (overlay.backgroundColor && overlay.backgroundColor !== 'transparent') {
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = overlay.backgroundColor;
    ctx.fillRect(left, top, boxWidth, boxHeight);
    ctx.restore();
    ctx.fillStyle = overlay.color || '#fff';
  }
  const textX = overlay.textAlign === 'left' ? left : overlay.textAlign === 'right' ? left + boxWidth : width * overlay.x / 100;
  ctx.fillText(overlay.content, textX, height * overlay.y / 100, boxWidth);
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
      const opacity = Math.max(0.1, Math.min(1, overlay.opacity ?? 1));
      if (fullFrame) filters.push(`[${index}:v]scale=${width}:${height},format=rgba,colorchannelmixer=aa=${opacity}[${prepared}]`);
      else {
        const targetWidth = Math.max(2, Math.round(width * overlay.width / 100));
        const targetHeight = Math.max(2, Math.round(height * overlay.height / 100));
        const mediaFilters: string[] = overlay.fit === 'cover'
          ? [`scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase`, `crop=${targetWidth}:${targetHeight}`]
          : [`scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`, 'format=rgba', `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`];
        mediaFilters.push(`eq=brightness=${(overlay.brightness || 0) / 100}:contrast=${Math.max(0.1, 1 + (overlay.contrast || 0) / 100)}:saturation=${Math.max(0, 1 + (overlay.saturation || 0) / 100)}`);
        if (overlay.hueRotate) mediaFilters.push(`hue=h=${overlay.hueRotate}`);
        if (overlay.grayscale && overlay.grayscale >= 50) mediaFilters.push('hue=s=0');
        if (overlay.sepia && overlay.sepia >= 50) mediaFilters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
        if (overlay.blur) mediaFilters.push(`gblur=sigma=${Math.max(0.1, overlay.blur / 2)}`);
        if (overlay.flipX) mediaFilters.push('hflip');
        if (overlay.flipY) mediaFilters.push('vflip');
        if (overlay.type === 'video' && overlay.playbackRate && overlay.playbackRate !== 1) mediaFilters.push(`setpts=${1 / overlay.playbackRate}*PTS`);
        const rotation = ((overlay.rotation || 0) % 360 + 360) % 360;
        if (rotation === 90) mediaFilters.push('transpose=1');
        else if (rotation === 180) mediaFilters.push('hflip', 'vflip');
        else if (rotation === 270) mediaFilters.push('transpose=2');
        mediaFilters.push('format=rgba', `colorchannelmixer=aa=${opacity}`);
        filters.push(`[${index}:v]${mediaFilters.join(',')}[${prepared}]`);
      }
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

export async function processAutoEditSequence(
  clips: AnalyzedClip[],
  shots: StoryShot[],
  format: OutputFormat,
  onProgress?: (progress: number) => void,
  preview = false,
) {
  if (!shots.length) throw new Error('Add at least one shot to the first cut.');
  const instance = await loadFFmpeg();
  const runId = Date.now().toString(36);
  const output = outputSize(format);
  const width = preview ? (format === 'youtube' ? 960 : 540) : output.width;
  const height = preview ? (format === 'youtube' ? 540 : 960) : output.height;
  const createdFiles: string[] = [];
  const segments: string[] = [];
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));
  const progressHandler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(.98, progress)));
  instance.on('progress', progressHandler);
  try {
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index]; const clip = clipMap.get(shot.clipId);
      if (!clip) continue;
      const inputName = `auto-input-${runId}-${index}.${clip.file.name.split('.').pop() || 'mp4'}`;
      const segmentName = `auto-segment-${runId}-${index}.mp4`;
      createdFiles.push(inputName, segmentName); segments.push(segmentName);
      await instance.writeFile(inputName, await fetchFile(clip.file));
      const scale = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
      const exitCode = await instance.exec(['-ss', String(shot.start), '-t', String(Math.max(.2, shot.end - shot.start)), '-i', inputName, '-vf', scale, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', preview ? '30' : '23', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', segmentName]);
      if (exitCode !== 0) throw new Error(`Could not render shot ${index + 1}.`);
      onProgress?.((index + .7) / (shots.length + 1));
    }
    if (!segments.length) throw new Error('The first cut contains no usable shots.');
    const listName = `auto-list-${runId}.txt`; const outputName = `auto-output-${runId}.mp4`;
    createdFiles.push(listName, outputName);
    await instance.writeFile(listName, new TextEncoder().encode(segments.map((name) => `file '${name}'`).join('\n')));
    let exitCode = await instance.exec(['-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', '-movflags', '+faststart', outputName]);
    if (exitCode !== 0) exitCode = await instance.exec(['-f', 'concat', '-safe', '0', '-i', listName, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-movflags', '+faststart', outputName]);
    if (exitCode !== 0) throw new Error('Could not assemble the first cut.');
    const data = await instance.readFile(outputName); onProgress?.(1);
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  } finally {
    instance.off('progress', progressHandler);
    await Promise.all(createdFiles.map((name) => instance.deleteFile(name).catch(() => undefined)));
  }
}
