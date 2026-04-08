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
} from 'lucide-react';

interface EditorControlsProps {
  videoFile: File | null;
  lutFile: File | null;
  onVideoUpload: (file: File) => void;
  onLutUpload: (file: File) => void;
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
}

const EditorControls: React.FC<EditorControlsProps> = ({
  videoFile,
  lutFile,
  onVideoUpload,
  onLutUpload,
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
}) => {
  const [importTab, setImportTab] = useState<'custom' | 'presets'>('custom');

  const [presetsList, setPresetsList] = useState<Array<{ id: string, name: string, cubePath: string, imagePath: string }>>([]);

  // Dynamically discover all presets dropped into the public/presets folder at runtime!
  useEffect(() => {
    let active = true;
    const discoverPresets = async () => {
      const found = [];
      // We check paths lut1 through lut30.
      for (let i = 1; i <= 30; i++) {
        const cubePath = `/presets/lut${i}.cube`;
        try {
          // A fast HEAD request just to check if the file exists on the server
          const res = await fetch(cubePath, { method: 'HEAD' });
          if (res.ok) {
            found.push({
              id: i.toString(),
              name: `Preset ${i}`,
              cubePath,
              imagePath: `/presets/lut${i}.jpg`
            });
          }
        } catch (err) {
          // Ignore network errors on missing files
        }
      }
      if (active) setPresetsList(found);
    };
    discoverPresets();
    return () => { active = false; };
  }, []);

  const handleVideoFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onVideoUpload(e.target.files[0]);
  };
  const handleLutFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onLutUpload(e.target.files[0]);
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

      {/* Format */}
      <div className="ctrl-section">
        <div className="ctrl-label">Output Format</div>
        <div className="format-pills">
          <button
            className={`format-pill ${format === 'youtube' ? 'active' : ''}`}
            onClick={() => setFormat('youtube')}
          >
            <Play style={{ width: 12, height: 12 }} /> YouTube 16:9
          </button>
          <button
            className={`format-pill ${format === 'instagram' ? 'active' : ''}`}
            onClick={() => setFormat('instagram')}
          >
            <Smartphone style={{ width: 12, height: 12 }} /> Reels 9:16
          </button>
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
          <div className="presets-grid">
            {presetsList.length === 0 && (
              <p style={{ gridColumn: 'span 2', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.7rem', padding: '1rem' }}>
                No presets found. Drop .cube files in public/presets/
              </p>
            )}
            {presetsList.map((preset) => (
              <button 
                key={preset.id}
                className="preset-tile"
                style={{ backgroundImage: `url(${preset.imagePath})` }}
                onClick={async () => {
                  try {
                    const res = await fetch(preset.cubePath);
                    if (!res.ok) throw new Error();
                    const blob = await res.blob();
                    onLutUpload(new File([blob], `${preset.name}.cube`));
                  } catch (err) {
                    alert(`Could not find ${preset.cubePath}. Please ensure the file is in the public/presets folder.`);
                  }
                }}
              >
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        )}
        {lutFile && (
          <div className="lut-info">
            <span className="lut-info-name">🎨 {lutFile.name}</span>
            <button className="lut-clear" onClick={onLutClear}>
              <X style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Trim */}
      {videoFile && duration > 0 && (
        <div className="ctrl-section">
          <div className="ctrl-label">
            <Scissors style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Trim
          </div>
          <div className="trim-display">
            <span className="trim-value">{startTime.toFixed(1)}s</span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>→</span>
            <span className="trim-value">{endTime.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            className="trim-slider"
            min={0}
            max={duration}
            step={0.1}
            value={startTime}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onTrimChange(Math.min(v, endTime - 0.5), endTime);
            }}
          />
          <input
            type="range"
            className="trim-slider"
            min={0}
            max={duration}
            step={0.1}
            value={endTime}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onTrimChange(startTime, Math.max(v, startTime + 0.5));
            }}
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
            <p className="progress-text">Processing... {(progress * 100).toFixed(0)}%</p>
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
    </div>
  );
};

export default EditorControls;
