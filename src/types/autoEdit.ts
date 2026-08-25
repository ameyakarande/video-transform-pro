import type { OutputFormat } from './editor';

export type StoryRole = 'hook' | 'setup' | 'development' | 'highlight' | 'ending';

export interface AnalyzedClip {
  id: string;
  file: File;
  url: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  motion: number;
  quality: number;
}

export interface StoryShot {
  id: string;
  clipId: string;
  start: number;
  end: number;
  role: StoryRole;
  note: string;
}

export interface AutoEditBrief {
  prompt: string;
  style: 'cinematic' | 'energetic' | 'documentary' | 'social';
  targetDuration: number;
  format: OutputFormat;
  objectFit: 'cover' | 'contain';
}
