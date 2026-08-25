export type OutputFormat = 'youtube' | 'instagram';
export type ObjectFitMode = 'cover' | 'contain';

export interface OverlayItem {
  id: string;
  type: 'text' | 'image' | 'video';
  content: string;
  file?: File;
  x: number;
  y: number;
  width: number;
  height: number;
  startTime: number;
  endTime: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right';
  opacity?: number;
  rotation?: number;
  borderRadius?: number;
  fit?: 'contain' | 'cover';
  flipX?: boolean;
  flipY?: boolean;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  grayscale?: number;
  sepia?: number;
  hueRotate?: number;
  playbackRate?: number;
  muted?: boolean;
  loop?: boolean;
}

export interface SubtitleItem {
  start: number;
  end: number;
  text: string;
}
