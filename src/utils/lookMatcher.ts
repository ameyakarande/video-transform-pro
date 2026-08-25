export interface MatchLookOptions {
  strength: number;
  preserveLuminance: boolean;
}

interface ChannelStats {
  mean: [number, number, number];
  std: [number, number, number];
  low: [number, number, number];
  high: [number, number, number];
}

async function pixelsFromImage(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 420 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas analysis is unavailable.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function pixelsFromVideo(file: File, requestedTime: number): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read the source video.'));
    });
    video.currentTime = Math.min(Math.max(0, requestedTime), Math.max(0, video.duration - 0.05));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Could not sample the source video.'));
    });
    const scale = Math.min(1, 420 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas analysis is unavailable.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function percentile(sorted: number[], amount: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * amount)))] || 0;
}

function analyze(image: ImageData): ChannelStats {
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let index = 0; index < image.data.length; index += 16) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (luminance < 4 || luminance > 251) continue;
    channels[0].push(red / 255);
    channels[1].push(green / 255);
    channels[2].push(blue / 255);
  }
  if (channels[0].length < 50) throw new Error('The reference does not contain enough usable color information.');
  const mean = channels.map((channel) => channel.reduce((sum, value) => sum + value, 0) / channel.length) as ChannelStats['mean'];
  const std = channels.map((channel, channelIndex) => Math.sqrt(channel.reduce((sum, value) => sum + (value - mean[channelIndex]) ** 2, 0) / channel.length)) as ChannelStats['std'];
  channels.forEach((channel) => channel.sort((left, right) => left - right));
  return {
    mean,
    std,
    low: channels.map((channel) => percentile(channel, 0.03)) as ChannelStats['low'],
    high: channels.map((channel) => percentile(channel, 0.97)) as ChannelStats['high'],
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function transformChannel(value: number, channel: number, source: ChannelStats, reference: ChannelStats) {
  const normalized = (value - source.mean[channel]) / Math.max(0.035, source.std[channel]);
  const statistical = reference.mean[channel] + normalized * reference.std[channel];
  const sourceRange = Math.max(0.08, source.high[channel] - source.low[channel]);
  const percentileMapped = reference.low[channel] + ((value - source.low[channel]) / sourceRange) * (reference.high[channel] - reference.low[channel]);
  return clamp(statistical * 0.62 + percentileMapped * 0.38);
}

export async function generateMatchedLut(sourceVideo: File, sourceTime: number, reference: Blob, options: MatchLookOptions) {
  const [sourcePixels, referencePixels] = await Promise.all([
    pixelsFromVideo(sourceVideo, sourceTime),
    pixelsFromImage(reference),
  ]);
  const source = analyze(sourcePixels);
  const target = analyze(referencePixels);
  const size = 33;
  const strength = Math.max(0, Math.min(1, options.strength));
  const lines = ['TITLE "Cinemaster Reference Match"', `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];

  for (let blueIndex = 0; blueIndex < size; blueIndex += 1) {
    for (let greenIndex = 0; greenIndex < size; greenIndex += 1) {
      for (let redIndex = 0; redIndex < size; redIndex += 1) {
        const input = [redIndex, greenIndex, blueIndex].map((value) => value / (size - 1));
        const matched = input.map((value, channel) => transformChannel(value, channel, source, target));
        if (options.preserveLuminance) {
          const inputLuminance = input[0] * 0.2126 + input[1] * 0.7152 + input[2] * 0.0722;
          const outputLuminance = matched[0] * 0.2126 + matched[1] * 0.7152 + matched[2] * 0.0722;
          const correction = inputLuminance - outputLuminance;
          matched[0] = clamp(matched[0] + correction);
          matched[1] = clamp(matched[1] + correction);
          matched[2] = clamp(matched[2] + correction);
        }
        const output = matched.map((value, channel) => input[channel] + (value - input[channel]) * strength);
        lines.push(output.map((value) => value.toFixed(6)).join(' '));
      }
    }
  }

  return new File([`${lines.join('\n')}\n`], `matched-look-${Date.now()}.cube`, { type: 'text/plain' });
}

export function parseYouTubeVideoId(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0];
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
      return url.searchParams.get('v') || '';
    }
  } catch {
    return '';
  }
  return '';
}
