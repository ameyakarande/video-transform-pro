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
  Activity,
  FastForward
} from 'lucide-react';
import FilmstripTrim from './FilmstripTrim';
import SocialPublish from './SocialPublish';
import { fetchPresetCatalog, getPresetCatalog, type PresetCatalogItem } from '../utils/presetCatalog';

const DEFAULT_PRESET_BACKEND_URL = (import.meta.env.VITE_SOCIAL_BACKEND_URL as string | undefined) || 'http://localhost:8787';

interface EditorControlsProps {
  videoFile: File | null;
  lutFiles: File[];
  onVideoUpload: (file: File) => void;
  onLutToggle: (file: File) => void;
  onLutClear: () => void;
  format: 'youtube' | 'instagram';
  setFormat: (format: 'youtube' | 'instagram') => void;
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
  overlays: any[];
  setOverlays: (o: any[]) => void;
  subtitles: any[];
  onSubtitleUpload: (f: File) => void;
  isStabilized: boolean;
  setIsStabilized: (s: boolean) => void;
  objectFit: 'cover' | 'contain';
  setObjectFit: (o: 'cover' | 'contain') => void;
  exportedBlob: Blob | null;
}

const EditorControls: React.FC<EditorControlsProps> = ({
  videoFile,
  lutFiles,
  onVideoUpload,
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
  isStabilized,
  setIsStabilized,
  objectFit,
  setObjectFit,
  exportedBlob
}) => {
  const [importTab, setImportTab] = useState<'custom' | 'presets'>('custom');
  const [presetsList, setPresetsList] = useState<PresetCatalogItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);

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
                    backgroundColor: preset.imagePath ? undefined : `hsl(${preset.fallbackHue} 65% 52%)`,
                    border: isActive ? '2px solid var(--accent)' : 'none',
                    boxShadow: isActive ? '0 0 15px var(--accent-glow)' : 'none'
                  }}
                  onClick={async () => {
                    try {
                      const res = await fetch(preset.cubePath);
                      if (!res.ok) throw new Error();
                      const blob = await res.blob();
                      onLutToggle(new File([blob], preset.fileName));
                    } catch (err) {
                      alert(`Could not find ${preset.cubePath}. Please ensure the file is in the public/presets folder.`);
                    }
                  }}
                >
                  {!preset.imagePath && <div className="preset-fallback-mark">{preset.name.slice(0, 2).toUpperCase()}</div>}
                  <span>{preset.name}</span>
                  {isActive && <div className="active-badge">Selected</div>}
                </button>
              );
            })}
          </div>
        )}
        {lutFiles.length > 0 && (
          <div className="lut-stack">
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '5px' }}>LUT Stack ({lutFiles.length}/3):</div>
            {lutFiles.map((file, idx) => (
              <div key={idx} className="lut-info" style={{ marginBottom: '4px' }}>
                <span className="lut-info-name">🎨 {file.name}</span>
                <button className="lut-clear" onClick={() => onLutToggle(file)}>
                  <X style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ))}
            <button className="btn-clear-all" onClick={onLutClear} style={{ fontSize: '0.6rem', padding: '2px 5px', marginTop: '5px' }}>
              Clear All
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
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={isStabilized} onChange={(e) => setIsStabilized(e.target.checked)} />
            <Activity style={{ width: 12, height: 12 }} />
            Stabilize Video (Export Only)
          </label>
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

      {/* Text & Asset Overlays */}
      {videoFile && (
        <div className="ctrl-section">
          <div className="ctrl-label">
            <Type style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Overlays & Assets
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              className="btn-add-overlay"
              style={{ fontSize: '0.7rem', padding: '6px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
              onClick={() => {
                const text = prompt("Enter text for overlay:");
                if (text) {
                  setOverlays([...overlays, {
                    id: Date.now().toString(),
                    type: 'text',
                    content: text,
                    x: 50,
                    y: 50,
                    width: 30,
                    height: 10,
                    startTime: 0,
                    endTime: duration || 10
                  }]);
                }
              }}
            >
              + Add Text Overlay
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <label className="btn-add-overlay" style={{ flex: 1, fontSize: '0.65rem', padding: '6px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '4px', color: 'white', cursor: 'pointer', textAlign: 'center' }}>
                + Image
                <input type="file" accept="image/*" hidden onChange={(e) => {
                  if (e.target.files?.[0]) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                      setOverlays([...overlays, {
                        id: Date.now().toString(),
                        type: 'image',
                        content: re.target?.result,
                        x: 50,
                        y: 50,
                        width: 30,
                        height: 30,
                        startTime: 0,
                        endTime: duration || 10
                      }]);
                    };
                    reader.readAsDataURL(e.target.files[0]);
                  }
                }} />
              </label>
              <label className="btn-add-overlay" style={{ flex: 1, fontSize: '0.65rem', padding: '6px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '4px', color: 'white', cursor: 'pointer', textAlign: 'center' }}>
                + Video
                <input type="file" accept="video/*" hidden onChange={(e) => {
                  if (e.target.files?.[0]) {
                    const url = URL.createObjectURL(e.target.files[0]);
                    setOverlays([...overlays, {
                      id: Date.now().toString(),
                      type: 'video',
                      content: url,
                      x: 50,
                      y: 50,
                      width: 30,
                      height: 30,
                      startTime: 0,
                      endTime: duration || 10
                    }]);
                  }
                }} />
              </label>
            </div>
          </div>
          {overlays.length > 0 && (
            <div className="overlay-list" style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '5px' }}>Active Overlays:</div>
              {overlays.map((ov, idx) => (
                <div key={idx} className="overlay-item" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.65rem', padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '4px' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ov.type === 'text' ? ov.content : `[${ov.type}] ${ov.id}`}
                  </span>
                  <button onClick={() => setOverlays(overlays.filter(o => o.id !== ov.id))} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
                    <X style={{ width: 10, height: 10 }} />
                  </button>
                </div>
              ))}
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
            <SocialPublish
              videoBlob={exportedBlob}
              videoFileName={videoFile?.name || 'My Video'}
            />
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
    </div>
  );
};

export default EditorControls;
