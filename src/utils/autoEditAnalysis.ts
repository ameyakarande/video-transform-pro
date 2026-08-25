import type { AnalyzedClip, AutoEditBrief, StoryRole, StoryShot } from '../types/autoEdit';

function loadVideo(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata'; video.muted = true; video.src = url;
  return new Promise<{ video: HTMLVideoElement; url: string }>((resolve, reject) => {
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not inspect ${file.name}.`)); };
  });
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve(); video.onerror = () => reject(new Error('Could not sample the clip.'));
    video.currentTime = Math.max(0, Math.min(time, Math.max(0, video.duration - .05)));
  });
}

function sample(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 240 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale)); canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas analysis is unavailable.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { data: context.getImageData(0, 0, canvas.width, canvas.height), thumbnail: canvas.toDataURL('image/jpeg', .72) };
}

function frameStats(data: ImageData) {
  const values: number[] = [];
  for (let index = 0; index < data.data.length; index += 24) values.push(data.data[index] * .2126 + data.data[index + 1] * .7152 + data.data[index + 2] * .0722);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length));
  return { brightness: mean / 255, contrast: Math.min(1, deviation / 72) };
}

function frameDifference(first: ImageData, second: ImageData) {
  let difference = 0, samples = 0;
  for (let index = 0; index < Math.min(first.data.length, second.data.length); index += 32) {
    difference += Math.abs(first.data[index] - second.data[index]) + Math.abs(first.data[index + 1] - second.data[index + 1]) + Math.abs(first.data[index + 2] - second.data[index + 2]); samples += 3;
  }
  return Math.min(1, difference / Math.max(1, samples) / 70);
}

export async function analyzeClip(file: File): Promise<AnalyzedClip> {
  const { video, url } = await loadVideo(file);
  await seek(video, video.duration * .28); const first = sample(video);
  await seek(video, video.duration * .62); const second = sample(video);
  const stats = frameStats(second.data); const motion = frameDifference(first.data, second.data);
  const exposureScore = 1 - Math.min(1, Math.abs(stats.brightness - .52) / .52);
  const quality = Math.round(Math.max(0, Math.min(100, (exposureScore * .44 + stats.contrast * .34 + (1 - Math.abs(motion - .38)) * .22) * 100)));
  return { id: crypto.randomUUID(), file, url, thumbnail: second.thumbnail, duration: video.duration, width: video.videoWidth, height: video.videoHeight, brightness: stats.brightness, contrast: stats.contrast, motion, quality };
}

const notes: Record<StoryRole, string> = {
  hook: 'Lead with the strongest visual to earn attention.', setup: 'Establish place, people, or context.',
  development: 'Build the sequence and maintain visual continuity.', highlight: 'Deliver the visual or emotional peak.', ending: 'Resolve the story with a clean closing image.',
};

export function createStoryline(clips: AnalyzedClip[], brief: AutoEditBrief): StoryShot[] {
  if (!clips.length) return [];
  const pace = brief.style === 'energetic' || brief.style === 'social' ? 2.8 : brief.style === 'documentary' ? 5.5 : 4.2;
  const desiredShots = Math.max(2, Math.min(clips.length * 2, Math.ceil(brief.targetDuration / pace)));
  const ranked = [...clips].sort((a, b) => b.quality - a.quality);
  const chosen = Array.from({ length: desiredShots }, (_, index) => ranked[index % ranked.length]);
  const strongest = chosen.shift() as AnalyzedClip;
  const ordered = [strongest, ...chosen.sort((a, b) => clips.indexOf(a) - clips.indexOf(b))];
  let remaining = brief.targetDuration;
  return ordered.map((clip, index) => {
    const role: StoryRole = index === 0 ? 'hook' : index === ordered.length - 1 ? 'ending' : index >= Math.floor(ordered.length * .65) ? 'highlight' : index === 1 ? 'setup' : 'development';
    const shotsLeft = ordered.length - index;
    const length = Math.min(clip.duration, Math.max(1.2, remaining / shotsLeft));
    const center = role === 'hook' || role === 'highlight' ? clip.duration * .5 : clip.duration * (index / Math.max(1, ordered.length - 1) * .5 + .2);
    const start = Math.max(0, Math.min(clip.duration - length, center - length / 2));
    remaining -= length;
    return { id: crypto.randomUUID(), clipId: clip.id, start, end: start + length, role, note: notes[role] };
  });
}
