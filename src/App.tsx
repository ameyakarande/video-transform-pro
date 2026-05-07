import { useState, useCallback } from 'react';
import VideoPreview from './components/VideoPreview';
import EditorControls from './components/EditorControls';
import { processVideo } from './utils/ffmpegUtils';
import { Coffee, Download, Menu, Sparkles, X } from 'lucide-react';

function App() {
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [lutFiles, setLutFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<'youtube' | 'instagram'>('youtube');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(10);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Advanced feature states
  const [speed, setSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [bgMusicFile, setBgMusicFile] = useState<File | null>(null);
  const [objectFit, setObjectFit] = useState<'cover' | 'contain'>('cover');
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<any[]>([]);
  const [subtitles, setSubtitles] = useState<any[]>([]);

  const handleVideoUpload = useCallback((file: File) => {
    setVideoFile(file);
    setStartTime(0);
    setEndTime(10);
  }, []);

  const handleDurationLoaded = useCallback((d: number) => {
    setDuration(d);
    setEndTime(Math.min(10, d));
  }, []);

  const handleLutToggle = useCallback((file: File) => {
    setLutFiles(prev => {
      const exists = prev.find(f => f.name === file.name);
      if (exists) return prev.filter(f => f.name !== file.name);
      if (prev.length >= 3) return prev;
      return [...prev, file];
    });
  }, []);

  const handleLutClear = useCallback(() => {
    setLutFiles([]);
  }, []);

  const handleVideoClear = useCallback(() => {
    setVideoFile(null);
    setLutFiles([]);
    setDuration(0);
    setStartTime(0);
    setEndTime(10);
    setOverlays([]);
    setSubtitles([]);
  }, []);

  const handleTrimChange = useCallback((start: number, end: number) => {
    setStartTime(start);
    setEndTime(end);
  }, []);

  const handleSubtitleUpload = useCallback(async (file: File) => {
    if (!file.name) {
      setSubtitles([]);
      return;
    }
    const text = await file.text();
    // Simple SRT parser
    const blocks = text.split(/\n\s*\n/);
    const parsed = blocks.map(block => {
      const lines = block.split('\n').filter(l => l.trim());
      if (lines.length < 3) return null;
      const timeMatch = lines[1].match(/(\d+:\d+:\d+,\d+) --> (\d+:\d+:\d+,\d+)/);
      if (!timeMatch) return null;
      
      const toSec = (s: string) => {
        const [h, m, sec] = s.split(':');
        const [ss, ms] = sec.split(',');
        return parseInt(h)*3600 + parseInt(m)*60 + parseInt(ss) + parseInt(ms)/1000;
      };

      return {
        start: toSec(timeMatch[1]),
        end: toSec(timeMatch[2]),
        text: lines.slice(2).join('\n')
      };
    }).filter(Boolean);
    setSubtitles(parsed);
  }, []);

  const handleDownload = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setProgress(0);

    // Render overlays to PNG for FFmpeg (Simplified: only first text overlay for now to avoid crash)
    let textOverlayDataUrl: string | undefined = undefined;
    const textOverlay = overlays.find(o => o.type === 'text');
    if (textOverlay) {
      const canvas = document.createElement('canvas');
      canvas.width = format === 'youtube' ? 1920 : 720;
      canvas.height = format === 'youtube' ? 1080 : 1280;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 80px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        // Position relative to canvas size
        const x = (textOverlay.x / 100) * canvas.width;
        const y = (textOverlay.y / 100) * canvas.height;
        ctx.fillText(textOverlay.content, x, y);
        textOverlayDataUrl = canvas.toDataURL('image/png');
      }
    }

    try {
      const blob = await processVideo(videoFile, { 
        startTime, 
        endTime, 
        format,
        speed,
        isMuted,
        bgMusicFile,
        textOverlayDataUrl,
        lutFiles
      }, (p) => setProgress(p));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `export-${format}-${Date.now()}.mp4`;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleClear = () => {
    setVideoFile(null);
    setLutFiles([]);
    setDuration(0);
    setStartTime(0);
    setEndTime(10);
    setSpeed(1);
    setIsMuted(false);
    setBgMusicFile(null);
    setOverlays([]);
    setSubtitles([]);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <Sparkles style={{ width: 14, height: 14 }} />
          </div>
          <span className="brand-name" style={{ color: 'var(--accent)', fontSize: '1rem' }}>Cinemaster</span>
          <span className="brand-tag">Beta Version</span>
        </div>
        <button
          className="header-menu-btn"
          onClick={() => setIsHeaderMenuOpen((open) => !open)}
          aria-expanded={isHeaderMenuOpen}
          aria-label="Toggle header menu"
        >
          {isHeaderMenuOpen
            ? <X style={{ width: 16, height: 16 }} />
            : <Menu style={{ width: 16, height: 16 }} />}
        </button>
        <div className={`header-actions ${isHeaderMenuOpen ? 'open' : ''}`}>
          <button className="header-action-btn coffee-btn" onClick={() => window.open('#', '_blank')}>
            <Coffee style={{ width: 14, height: 14 }} />
            Buy me a coffee
          </button>
          <button className="header-action-btn desktop-btn" onClick={() => window.open('#', '_blank')}>
            <Download style={{ width: 14, height: 14 }} />
            <span>Get Desktop App</span>
            <small>Coming soon</small>
          </button>
        </div>
      </header>

      <main className="app-main">
        <VideoPreview
          videoFile={videoFile}
          startTime={startTime}
          endTime={endTime}
          format={format}
          lutFiles={lutFiles}
          onDurationLoaded={handleDurationLoaded}
          speed={speed}
          isMuted={isMuted}
          overlays={overlays}
          setOverlays={setOverlays}
          subtitles={subtitles}
          objectFit={objectFit}
          selectedOverlayId={selectedOverlayId}
          setSelectedOverlayId={setSelectedOverlayId}
        />

        <EditorControls
          videoFile={videoFile}
          lutFiles={lutFiles}
          onVideoUpload={handleVideoUpload}
          onVideoClear={handleVideoClear}
          onLutToggle={handleLutToggle}
          onLutClear={handleLutClear}
          format={format}
          setFormat={setFormat}
          startTime={startTime}
          endTime={endTime}
          duration={duration}
          onTrimChange={handleTrimChange}
          onDownload={handleDownload}
          onClear={handleClear}
          isProcessing={isProcessing}
          progress={progress}
          speed={speed}
          setSpeed={setSpeed}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          bgMusicFile={bgMusicFile}
          setBgMusicFile={setBgMusicFile}
          overlays={overlays}
          setOverlays={setOverlays}
          subtitles={subtitles}
          onSubtitleUpload={handleSubtitleUpload}
          objectFit={objectFit}
          setObjectFit={setObjectFit}
        />
      </main>

      <footer className="app-footer">
        Powered by FFmpeg.wasm & WebGL2 · All processing happens locally in your browser
      </footer>
    </div>
  );
}

export default App;
