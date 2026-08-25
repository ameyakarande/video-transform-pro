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
}

export interface SubtitleItem {
  start: number;
  end: number;
  text: string;
}
