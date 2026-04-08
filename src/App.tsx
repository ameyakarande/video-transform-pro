import { useState, useCallback } from 'react';
import VideoPreview from './components/VideoPreview';
import EditorControls from './components/EditorControls';
import { processVideo } from './utils/ffmpegUtils';
import { Sparkles } from 'lucide-react';

function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [lutFile, setLutFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'youtube' | 'instagram'>('youtube');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(10);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleVideoUpload = useCallback((file: File) => {
    setVideoFile(file);
    setStartTime(0);
    setEndTime(10);
  }, []);

  const handleDurationLoaded = useCallback((d: number) => {
    setDuration(d);
    setEndTime(Math.min(10, d));
  }, []);

  const handleLutUpload = useCallback((file: File) => {
    setLutFile(file);
  }, []);

  const handleLutClear = useCallback(() => {
    setLutFile(null);
  }, []);

  const handleTrimChange = useCallback((start: number, end: number) => {
    setStartTime(start);
    setEndTime(end);
  }, []);

  const handleDownload = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      const blob = await processVideo(videoFile, { startTime, endTime, format }, (p) => setProgress(p));
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
    setLutFile(null);
    setDuration(0);
    setStartTime(0);
    setEndTime(10);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <Sparkles style={{ width: 14, height: 14 }} />
          </div>
          <span className="brand-name">Transform Pro</span>
          <span className="brand-tag">Beta</span>
        </div>
      </header>

      <main className="app-main">
        <VideoPreview
          videoFile={videoFile}
          startTime={startTime}
          endTime={endTime}
          format={format}
          lutFile={lutFile}
          onDurationLoaded={handleDurationLoaded}
        />

        <EditorControls
          videoFile={videoFile}
          lutFile={lutFile}
          onVideoUpload={handleVideoUpload}
          onLutUpload={handleLutUpload}
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
        />
      </main>

      <footer className="app-footer">
        Powered by FFmpeg.wasm & WebGL2 · All processing happens locally in your browser
      </footer>
    </div>
  );
}

export default App;
