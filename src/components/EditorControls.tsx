import React, { type ChangeEvent, useState, useEffect } from 'react';
import {
  Upload,
  Palette,
  Play,
  Smartphone,
  Scissors,
  Download,
  RotateCcw,
  X,
  Type,
  Music,
  VolumeX,
  FastForward,
  Image as ImageIcon,
  Video as VideoIcon,
  Search,
  Plus
} from 'lucide-react';
import FilmstripTrim from './FilmstripTrim';
import { fetchPresetCatalog, getPresetCatalog, type PresetCatalogItem } from '../utils/presetCatalog';
import type { ObjectFitMode, OutputFormat, OverlayItem, SubtitleItem } from '../types/editor';
import SocialPublish from './SocialPublish';

const DEFAULT_PRESET_BACKEND_URL = (import.meta.env.VITE_SOCIAL_BACKEND_URL as string | undefined) || 'http://localhost:8787';

interface EditorControlsProps {
  videoFile: File | null;
  lutFiles: File[];
  onVideoUpload: (file: File) => void;
  onVideoClear: () => void;
  onLutToggle: (file: File) => void;
  onLutClear: () => void;
  format: OutputFormat;
  setFormat: (format: OutputFormat) => void;
  startTime: number;
  endTime: number;
  duration: number;
  onTrimChange: (start: number, end: number) => void;
  onDownload: () => void;
  onClear: () => void;
  isProcessing: boolean;
  progress: number;
  speed: number;
  setSpeed: (s: number) => void;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  bgMusicFile: File | null;
  setBgMusicFile: (f: File | null) => void;
  overlays: OverlayItem[];
  setOverlays: React.Dispatch<React.SetStateAction<OverlayItem[]>>;
  subtitles: SubtitleItem[];
  onSubtitleUpload: (f: File) => void;
  objectFit: ObjectFitMode;
  setObjectFit: (o: ObjectFitMode) => void;
  exportedVideo: Blob | null;
  exportFileName: string;
  selectedOverlayId: string | null;
  setSelectedOverlayId: (id: string | null) => void;
}

const EditorControls: React.FC<EditorControlsProps> = ({
  videoFile,
  lutFiles,
  onVideoUpload,
  onVideoClear,
  onLutToggle,
  onLutClear,
  format,
  setFormat,
  startTime,
  endTime,
  duration,
  onTrimChange,
  onDownload,
  onClear,
  isProcessing,
  progress,
  speed,
  setSpeed,
  isMuted,
  setIsMuted,
  bgMusicFile,
  setBgMusicFile,
  overlays,
  setOverlays,
  subtitles,
  onSubtitleUpload,
  objectFit,
  setObjectFit,
  exportedVideo,
  exportFileName,
  selectedOverlayId,
  setSelectedOverlayId
}) => {
  const [importTab, setImportTab] = useState<'custom' | 'presets'>('custom');
  const [presetsList, setPresetsList] = useState<PresetCatalogItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [presetMode, setPresetMode] = useState<'single' | 'multi'>('single');
  const [elementsOpen, setElementsOpen] = useState(false);
  const [elementSearch, setElementSearch] = useState('');

  const addTextOverlay = (preset: 'heading' | 'subheading' | 'body') => {
    const settings = {
      heading: { content: 'Add a heading', fontSize: 72, width: 52, height: 14, fontWeight: 'bold' as const },
      subheading: { content: 'Add a subheading', fontSize: 48, width: 44, height: 11, fontWeight: 'bold' as const },
      body: { content: 'Add a little bit of body text', fontSize: 30, width: 40, height: 9, fontWeight: 'normal' as const },
    }[preset];
    const id = crypto.randomUUID();
    setOverlays((items) => [...items, {
      id, type: 'text', x: 50, y: 50,
      startTime, endTime, color: '#ffffff', fontFamily: 'Inter',
      textAlign: 'center', opacity: 1, rotation: 0, borderRadius: 0,
      ...settings,
    }]);
    setSelectedOverlayId(id);
  };

  const addMediaOverlay = async (file: File, type: 'image' | 'video') => {
    const content = URL.createObjectURL(file);
    let aspectRatio = 1;
    try {
      if (type === 'image') {
        const bitmap = await createImageBitmap(file);
        aspectRatio = bitmap.width / bitmap.height;
        bitmap.close();
      } else {
        aspectRatio = await new Promise<number>((resolve, reject) => {
          const probe = document.createElement('video');
          probe.preload = 'metadata';
          probe.onloadedmetadata = () => resolve(probe.videoWidth / probe.videoHeight);
          probe.onerror = () => reject(new Error('Could not read video dimensions'));
          probe.src = content;
        });
      }
    } catch {
      aspectRatio = 1;
    }
    const frameRatio = format === 'youtube' ? 16 / 9 : 9 / 16;
    let width = 34;
    let height = width * frameRatio / aspectRatio;
    if (height > 65) { height = 65; width = height * aspectRatio / frameRatio; }
    if (height < 12) { height = 12; width = height * aspectRatio / frameRatio; }
    if (width > 72) { width = 72; height = width * frameRatio / aspectRatio; }
    const id = crypto.randomUUID();
    setOverlays((items) => [...items, {
      id, type, content, file, x: 50, y: 50,
      width, height, startTime, endTime,
      opacity: 1, rotation: 0, borderRadius: 0,
    }]);
    setSelectedOverlayId(id);
  };

  // Poll the local preset API so dropped files appear without a rebuild.
  useEffect(() => {
    let active = true;

    const refreshPresets = async () => {
      const next = await fetchPresetCatalog(DEFAULT_PRESET_BACKEND_URL);
      if (!active) return;
      setPresetsList(next.length > 0 ? next : getPresetCatalog());
    };

    void refreshPresets();
    const intervalId = window.setInterval(() => {
      void refreshPresets();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleVideoFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onVideoUpload(e.target.files[0]);
  };
  const handleLutFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onLutToggle(e.target.files[0]);
  };

  return (
    <div className="controls">
      {/* Video Source */}
      <div className="ctrl-section">
        <div className="ctrl-label">Source Video</div>
        <label className="upload-card" style={{ flexDirection: 'row', padding: '0.8rem' }}>
          <Upload style={{ width: 18, height: 18 }} />
          <span>Upload Video File</span>
          <input type="file" accept="video/*" hidden onChange={handleVideoFile} />
        </label>
        {videoFile && (
          <button className="btn-clear btn-clear-video" onClick={onVideoClear}>
            <X style={{ width: 12, height: 12 }} />
            Clear Video
          </button>
        )}
      </div>

      {/* Format & Display */}
      <div className="ctrl-section">
        <div className="ctrl-label">Output & Display</div>
        <div className="format-pills" style={{ marginBottom: '8px' }}>
          <button className={`format-pill ${format === 'youtube' ? 'active' : ''}`} onClick={() => setFormat('youtube')}>
            <Play style={{ width: 12, height: 12 }} /> 16:9
          </button>
          <button className={`format-pill ${format === 'instagram' ? 'active' : ''}`} onClick={() => setFormat('instagram')}>
            <Smartphone style={{ width: 12, height: 12 }} /> 9:16
          </button>
        </div>
        <div className="format-pills">
          <button className={`format-pill ${objectFit === 'cover' ? 'active' : ''}`} onClick={() => setObjectFit('cover')}>Fill</button>
          <button className={`format-pill ${objectFit === 'contain' ? 'active' : ''}`} onClick={() => setObjectFit('contain')}>Fit</button>
        </div>
      </div>

      {/* Color Grading */}
      <div className="ctrl-section">
        <div className="ctrl-label">Color Grading</div>
        
        <div className="tabs-header">
          <button className={`tab-btn ${importTab === 'custom' ? 'active' : ''}`} onClick={() => setImportTab('custom')}>Custom</button>
          <button className={`tab-btn ${importTab === 'presets' ? 'active' : ''}`} onClick={() => setImportTab('presets')}>Presets</button>
        </div>

        {importTab === 'custom' ? (
          <label className="upload-card" style={{ padding: '1rem' }}>
            <Palette style={{ width: 18, height: 18 }} />
            <span>Upload LUT (.cube)</span>
            <input type="file" accept=".cube" hidden onChange={handleLutFile} />
          </label>
        ) : (
          <>
            <div className="preset-mode-toggle fade-in">
              <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 600 }}>Selection Mode</span>
              <div className="mode-pills">
                <button 
                  className={`mode-pill ${presetMode === 'single' ? 'active' : ''}`} 
                  onClick={() => { setPresetMode('single'); onLutClear(); }}
                  style={{ borderRadius: 'var(--radius-pill)', fontSize: '10px' }}
                >
                  Single
                </button>
                <button 
                  className={`mode-pill ${presetMode === 'multi' ? 'active' : ''}`} 
                  onClick={() => setPresetMode('multi')}
                  style={{ borderRadius: 'var(--radius-pill)', fontSize: '10px' }}
                >
                  Multi
                </button>
              </div>
            </div>

            <div 
              className="presets-grid no-scrollbar" 
            style={{ maxHeight: '300px', overflowY: 'auto' }}
            onScroll={(e) => {
              const target = e.currentTarget;
              if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
                setVisibleCount(v => Math.min(v + 6, presetsList.length));
              }
            }}
          >
            {presetsList.length === 0 && (
              <p style={{ gridColumn: 'span 2', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.7rem', padding: '1rem' }}>
                No presets found. Drop .cube files in public/presets/
              </p>
            )}
            {presetsList.slice(0, visibleCount).map((preset) => {
              const isActive = lutFiles.some(f => f.name === preset.fileName);
              return (
                <button 
                  key={preset.id}
                  className={`preset-tile ${isActive ? 'active' : ''}`}
                  style={{ 
                    backgroundImage: preset.imagePath ? `url(${preset.imagePath})` : undefined,
                    backgroundColor: preset.imagePath ? undefined : `hsl(${preset.fallbackHue} 34% 24%)`,
                    '--preset-hue': preset.fallbackHue,
                    border: isActive ? '2px solid var(--accent)' : 'none',
                    boxShadow: isActive ? '0 0 15px var(--accent-glow)' : 'none'
                  } as React.CSSProperties}
                  onClick={async () => {
                    try {
                      const res = await fetch(preset.cubePath);
                      if (!res.ok) throw new Error();
                      const blob = await res.blob();
                      const file = new File([blob], preset.fileName);
                      
                      if (presetMode === 'single') {
                        const isActive = lutFiles.some(f => f.name === preset.fileName);
                        if (!isActive) {
                          onLutClear();
                        }
                      }
                      onLutToggle(file);
                    } catch {
                      alert(`Could not find ${preset.cubePath}. Please ensure the file is in the public/presets folder.`);
                    }
                  }}
                >
                  {!preset.imagePath && <div className="preset-fallback-mark" aria-hidden="true" />}
                  <span>{preset.name}</span>
                  {isActive && <div className="active-badge">Selected</div>}
                </button>
              );
            })}
          </div>
        </>
      )}
        {lutFiles.length > 0 && (
          <div className="lut-stack">
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '5px' }}>
              {presetMode === 'single' ? 'Active Preset:' : `LUT Stack (${lutFiles.length}/3):`}
            </div>
            {lutFiles.map((file, idx) => (
              <div key={idx} className="lut-info" style={{ marginBottom: '4px' }}>
                <span className="lut-info-name">🎨 {file.name}</span>
                <button className="lut-clear" onClick={() => onLutToggle(file)}>
                  <X style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ))}
            <button className="btn-clear" onClick={onLutClear} style={{ height: '28px', fontSize: '10px', marginTop: '10px' }}>
              Clear All Presets
            </button>
          </div>
        )}
      </div>

      {/* Playback & FX Setup */}
      {videoFile && (
        <div className="ctrl-section">
          <div className="ctrl-label">
            <FastForward style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Playback & Effects
          </div>
          <div className="format-toggles" style={{ marginBottom: '10px' }}>
            <button className={`fmt-btn ${speed === 0.5 ? 'active' : ''}`} onClick={() => setSpeed(0.5)}>0.5x</button>
            <button className={`fmt-btn ${speed === 1 ? 'active' : ''}`} onClick={() => setSpeed(1)}>1.0x</button>
            <button className={`fmt-btn ${speed === 1.5 ? 'active' : ''}`} onClick={() => setSpeed(1.5)}>1.5x</button>
            <button className={`fmt-btn ${speed === 2 ? 'active' : ''}`} onClick={() => setSpeed(2)}>2.0x</button>
          </div>
        </div>
      )}

      {/* Advanced Audio */}
      {videoFile && (
        <div className="ctrl-section">
          <div className="ctrl-label">
            <Music style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Advanced Audio
          </div>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            <input type="checkbox" checked={isMuted} onChange={(e) => setIsMuted(e.target.checked)} />
            <VolumeX style={{ width: 12, height: 12 }} />
            Mute Original Audio
          </label>
          {bgMusicFile ? (
            <div className="file-info" style={{ marginBottom: 0 }}>
              <Music style={{ width: 12, height: 12, color: 'var(--accent)' }} />
              <span className="file-info-text">{bgMusicFile.name}</span>
              <button className="btn-clear" onClick={() => setBgMusicFile(null)} style={{ padding: '2px', marginLeft: 'auto' }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ) : (
            <label className="upload-btn" style={{ padding: '0.5rem', background: 'var(--bg-hover)', border: '1px dashed var(--border)', textAlign: 'center' }}>
              <input type="file" accept="audio/*" hidden onChange={(e) => e.target.files && setBgMusicFile(e.target.files[0])} />
              <span style={{ fontSize: '0.75rem' }}>+ Add Background Music</span>
            </label>
          )}
        </div>
      )}

      {/* Canva-style Elements */}
      {videoFile && (
        <div className="ctrl-section elements-section">
          <button className="elements-launch" onClick={() => setElementsOpen((open) => !open)}>
            <span className="elements-launch-icon"><Plus /></span>
            <span><strong>Elements</strong><small>Add text, images and video</small></span>
            <span className="elements-launch-arrow">{elementsOpen ? '−' : '+'}</span>
          </button>

          {elementsOpen && (
            <div className="elements-panel">
              <label className="elements-search">
                <Search />
                <input value={elementSearch} onChange={(event) => setElementSearch(event.target.value)} placeholder="Search elements" />
              </label>

              {(!elementSearch || 'text heading subheading body'.includes(elementSearch.toLowerCase())) && (
                <div className="elements-group">
                  <div className="elements-group-title"><Type /> Text</div>
                  <button className="text-preset heading" onClick={() => addTextOverlay('heading')}>Add a heading</button>
                  <button className="text-preset subheading" onClick={() => addTextOverlay('subheading')}>Add a subheading</button>
                  <button className="text-preset body" onClick={() => addTextOverlay('body')}>Add a little bit of body text</button>
                </div>
              )}

              <div className="elements-group">
                <div className="elements-group-title">Uploads</div>
                <div className="upload-element-grid">
                  <label className="upload-element-card">
                    <ImageIcon /><strong>Image</strong><small>JPG, PNG, WebP</small>
                    <input type="file" accept="image/*" hidden onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void addMediaOverlay(file, 'image');
                      event.target.value = '';
                    }} />
                  </label>
                  <label className="upload-element-card">
                    <VideoIcon /><strong>Video</strong><small>MP4, WebM</small>
                    <input type="file" accept="video/*" hidden onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void addMediaOverlay(file, 'video');
                      event.target.value = '';
                    }} />
                  </label>
                </div>
              </div>

              {overlays.length > 0 && (
                <div className="elements-group layers-group">
                  <div className="elements-group-title">Layers <span>{overlays.length}</span></div>
                  {overlays.slice().reverse().map((overlay) => (
                    <div key={overlay.id} className={`element-layer ${selectedOverlayId === overlay.id ? 'active' : ''}`} onClick={() => setSelectedOverlayId(overlay.id)}>
                      {overlay.type === 'text' ? <Type /> : overlay.type === 'image' ? <ImageIcon /> : <VideoIcon />}
                      <span>{overlay.type === 'text' ? overlay.content : overlay.file?.name || overlay.type}</span>
                      <button onClick={(event) => { event.stopPropagation(); setOverlays((items) => items.filter((item) => item.id !== overlay.id)); }} aria-label="Delete layer"><X /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Subtitles */}
      {videoFile && (
        <div className="ctrl-section">
          <div className="ctrl-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Type style={{ width: 10, height: 10 }} /> Subtitles
            </span>
          </div>
          {subtitles.length > 0 ? (
            <div className="file-info">
              <span className="file-info-text">Subtitles Loaded ({subtitles.length} lines)</span>
              <button className="btn-clear" onClick={() => onSubtitleUpload(new File([], ""))} style={{ marginLeft: 'auto' }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ) : (
            <label className="upload-card" style={{ padding: '0.6rem', fontSize: '0.7rem' }}>
              <span>Upload .srt Subtitles</span>
              <input type="file" accept=".srt" hidden onChange={e => e.target.files?.[0] && onSubtitleUpload(e.target.files[0])} />
            </label>
          )}
        </div>
      )}

      {/* Trim */}
      {videoFile && duration > 0 && (
        <div className="ctrl-section">
          <div className="ctrl-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><Scissors style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Trim Area</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input 
                type="number" 
                step="0.1" 
                value={startTime} 
                onChange={(e) => onTrimChange(parseFloat(e.target.value) || 0, endTime)}
                className="trim-input"
              />
              <span style={{ color: 'var(--text-dim)', fontSize: '0.6rem' }}>to</span>
              <input 
                type="number" 
                step="0.1" 
                value={endTime} 
                onChange={(e) => onTrimChange(startTime, parseFloat(e.target.value) || duration)}
                className="trim-input"
              />
            </div>
          </div>
          <FilmstripTrim 
            videoFile={videoFile}
            duration={duration}
            startTime={startTime}
            endTime={endTime}
            onTrimChange={onTrimChange}
          />
        </div>
      )}

      {/* Actions */}
      <div className="action-section">
        {isProcessing ? (
          <>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="progress-text">Rendering... {(progress * 100).toFixed(0)}%</p>
          </>
        ) : (
          <>
            <button
              className="btn-export"
              onClick={onDownload}
              disabled={!videoFile}
            >
              <Download style={{ width: 16, height: 16 }} />
              Export Video
            </button>
            <button className="btn-clear" onClick={onClear}>
              <RotateCcw style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Reset Project
            </button>
          </>
        )}
      </div>
      <div className="ctrl-section">
        <SocialPublish videoBlob={exportedVideo} videoFileName={exportFileName} />
      </div>
    </div>
  );
};

export default EditorControls;
