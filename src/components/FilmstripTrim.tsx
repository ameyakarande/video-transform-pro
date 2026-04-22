import React, { useState, useEffect } from 'react';
import { extractFrames } from '../utils/frameExtractor';

interface FilmstripTrimProps {
  videoFile: File;
  duration: number;
  startTime: number;
  endTime: number;
  onTrimChange: (start: number, end: number) => void;
}

const FilmstripTrim: React.FC<FilmstripTrimProps> = ({
  videoFile,
  duration,
  startTime,
  endTime,
  onTrimChange
}) => {
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadFrames = async () => {
      setLoading(true);
      try {
        // Extract 10 frames for a nice long filmstrip
        const extracted = await extractFrames(videoFile, 10, 0.4);
        if (active) setFrames(extracted);
      } catch (err) {
        console.warn("Failed to extract frames", err);
      }
      if (active) setLoading(false);
    };
    loadFrames();
    return () => { active = false; };
  }, [videoFile]);

  const handleStartDrag = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    onTrimChange(Math.min(v, endTime - 0.2), endTime);
  };

  const handleEndDrag = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    onTrimChange(startTime, Math.max(v, startTime + 0.2));
  };

  const startPct = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPct = duration > 0 ? (endTime / duration) * 100 : 100;

  return (
    <div className="filmstrip-container">
      <div className="filmstrip-frames" style={{ opacity: loading ? 0.3 : 1 }}>
        {frames.length > 0 ? (
          frames.map((src, i) => <img key={i} src={src} alt="frame" />)
        ) : (
          /* Placeholder blocks while loading */
          Array.from({ length: 10 }).map((_, i) => <div key={i} className="filmstrip-skeleton" />)
        )}
      </div>

      <div className="filmstrip-dim filmstrip-dim-left" style={{ width: `${startPct}%` }} />
      <div className="filmstrip-dim filmstrip-dim-right" style={{ left: `${endPct}%`, right: 0 }} />
      
      <div className="filmstrip-selection" style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}>
         {/* Little custom handle visuals injected via CSS or DOM */}
         <div className="handle-visual handle-left" />
         <div className="handle-visual handle-right" />
      </div>

      <input
        type="range"
        className="filmstrip-input"
        min={0}
        max={duration}
        step={0.05}
        value={startTime}
        onChange={handleStartDrag}
        /* Dynamic z-index prevents one thumb from blocking the other when close */
        style={{ zIndex: startTime > (duration/2) ? 5 : 4 }}
      />
      <input
        type="range"
        className="filmstrip-input"
        min={0}
        max={duration}
        step={0.05}
        value={endTime}
        onChange={handleEndDrag}
        style={{ zIndex: startTime > (duration/2) ? 4 : 5 }}
      />
    </div>
  );
};

export default FilmstripTrim;
