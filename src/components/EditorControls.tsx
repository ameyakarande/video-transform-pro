import React, { type ChangeEvent } from 'react';
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
  const handleVideoFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onVideoUpload(e.target.files[0]);
  };
  const handleLutFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onLutUpload(e.target.files[0]);
  };

  return (
    <div className="controls">
      {/* Upload */}
      <div className="ctrl-section">
        <div className="ctrl-label">Import</div>
        <div className="upload-grid">
          <label className="upload-card">
            <Upload style={{ width: 18, height: 18 }} />
            <span>Video</span>
            <input type="file" accept="video/*" hidden onChange={handleVideoFile} />
          </label>
          <label className="upload-card">
            <Palette style={{ width: 18, height: 18 }} />
            <span>LUT (.cube)</span>
            <input type="file" accept=".cube" hidden onChange={handleLutFile} />
          </label>
        </div>
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
