import { useEffect, useState, useCallback, useRef } from 'react';
import VideoPreview from './components/VideoPreview';
import EditorControls from './components/EditorControls';
import HowItWorks from './components/HowItWorks';
import { processVideo } from './utils/ffmpegUtils';
import { BookOpen, Coffee, Download, Menu, Sparkles, X } from 'lucide-react';
import type { ObjectFitMode, OutputFormat, OverlayItem, SubtitleItem } from './types/editor';

function App() {
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [page, setPage] = useState<'editor' | 'how'>(
    window.location.hash === '#how-it-works' ? 'how' : 'editor'
  );
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [lutFiles, setLutFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutputFormat>('youtube');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(10);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Advanced feature states
  const [speed, setSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [bgMusicFile, setBgMusicFile] = useState<File | null>(null);
  const [objectFit, setObjectFit] = useState<ObjectFitMode>('cover');
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [exportedVideo, setExportedVideo] = useState<Blob | null>(null);
  const previousOverlayUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentUrls = new Set(overlays.filter((item) => item.type === 'video').map((item) => item.content));
    previousOverlayUrls.current.forEach((url) => {
      if (!currentUrls.has(url)) URL.revokeObjectURL(url);
    });
    previousOverlayUrls.current = currentUrls;
  }, [overlays]);

  useEffect(() => {
    const handleHashChange = () => {
      setPage(window.location.hash === '#how-it-works' ? 'how' : 'editor');
      setIsHeaderMenuOpen(false);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const goToEditor = useCallback(() => {
    window.location.hash = '';
    setPage('editor');
    setIsHeaderMenuOpen(false);
  }, []);

  const goToHowItWorks = useCallback(() => {
    window.location.hash = 'how-it-works';
    setPage('how');
    setIsHeaderMenuOpen(false);
  }, []);

  const handleVideoUpload = useCallback((file: File) => {
    setVideoFile(file);
    setStartTime(0);
    setEndTime(10);
    setExportedVideo(null);
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
    }).filter((item): item is SubtitleItem => item !== null);
    setSubtitles(parsed);
  }, []);

  const handleDownload = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const blob = await processVideo(videoFile, { 
        startTime, 
        endTime, 
        format,
        speed,
        isMuted,
        bgMusicFile,
        lutFiles,
        overlays,
        subtitles,
        objectFit,
      }, (p) => setProgress(p));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `export-${format}-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportedVideo(blob);
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
          <button className="header-action-btn info-btn" onClick={goToHowItWorks}>
            <BookOpen style={{ width: 14, height: 14 }} />
            How it works
          </button>
          <a className="header-action-btn coffee-btn" href="mailto:?subject=Support%20Cinemaster">
            <Coffee style={{ width: 14, height: 14 }} />
            Buy me a coffee
          </a>
          <button className="header-action-btn desktop-btn" disabled title="Desktop app is coming soon">
            <Download style={{ width: 14, height: 14 }} />
            <span>Get Desktop App</span>
            <small>Coming soon</small>
          </button>
        </div>
      </header>

      {page === 'how' ? (
        <HowItWorks onBack={goToEditor} />
      ) : (
        <main className="app-main">
          <VideoPreview
            videoFile={videoFile}
            startTime={startTime}
            endTime={endTime}
            format={format}
            lutFiles={lutFiles}
            onVideoUpload={handleVideoUpload}
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
            exportedVideo={exportedVideo}
            exportFileName={`export-${format}.mp4`}
          />
        </main>
      )}

      <footer className="app-footer">
        Powered by FFmpeg.wasm & WebGL2 · Video editing happens locally in your browser
      </footer>
    </div>
  );
}

export default App;
