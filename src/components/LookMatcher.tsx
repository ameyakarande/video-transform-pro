import { useEffect, useState } from 'react';
import { Download, ExternalLink, Image as ImageIcon, Link2, LoaderCircle, Sparkles, Upload, X } from 'lucide-react';
import { generateMatchedLut, parseYouTubeVideoId } from '../utils/lookMatcher';

interface LookMatcherProps {
  sourceVideo: File;
  sourceTime: number;
  onApply: (file: File) => void;
}

export default function LookMatcher({ sourceVideo, sourceTime, onApply }: LookMatcherProps) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState<Blob | null>(null);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeVideoId, setYoutubeVideoId] = useState('');
  const [strength, setStrength] = useState(80);
  const [preserveLuminance, setPreserveLuminance] = useState(true);
  const [generatedLut, setGeneratedLut] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => { if (referenceUrl.startsWith('blob:')) URL.revokeObjectURL(referenceUrl); };
  }, [referenceUrl]);

  const setReferenceBlob = (blob: Blob, previewUrl: string, videoId = '') => {
    if (referenceUrl.startsWith('blob:')) URL.revokeObjectURL(referenceUrl);
    setReference(blob);
    setReferenceUrl(previewUrl);
    setYoutubeVideoId(videoId);
    setGeneratedLut(null);
    setError('');
  };

  const loadYouTubeReference = async () => {
    const videoId = parseYouTubeVideoId(youtubeUrl);
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      setError('Enter a valid YouTube video or Shorts URL.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const response = await fetch(`/api/youtube-thumbnail?videoId=${encodeURIComponent(videoId)}`);
      if (!response.ok) throw new Error('YouTube did not return a usable reference thumbnail.');
      const blob = await response.blob();
      setReferenceBlob(blob, URL.createObjectURL(blob), videoId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the YouTube reference.');
    } finally {
      setWorking(false);
    }
  };

  const matchLook = async () => {
    if (!reference) return;
    setWorking(true);
    setError('');
    try {
      const lut = await generateMatchedLut(sourceVideo, sourceTime, reference, {
        strength: strength / 100,
        preserveLuminance,
      });
      setGeneratedLut(lut);
      onApply(lut);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Look matching failed.');
    } finally {
      setWorking(false);
    }
  };

  const downloadLut = () => {
    if (!generatedLut) return;
    const url = URL.createObjectURL(generatedLut);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = generatedLut.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="look-matcher">
      <button className="look-match-launch" onClick={() => setOpen((current) => !current)}>
        <span><Sparkles /></span>
        <div><strong>Match a reference look</strong><small>Create a LUT from an image or YouTube URL</small></div>
        <b>{open ? '−' : '+'}</b>
      </button>

      {open && (
        <div className="look-match-panel">
          <div className="look-source-tabs">
            <label>
              <Upload /><span>Upload reference</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setReferenceBlob(file, URL.createObjectURL(file));
                event.target.value = '';
              }} />
            </label>
          </div>

          <div className="youtube-reference-entry">
            <div><Link2 /><input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="Paste YouTube URL" /></div>
            <button onClick={() => void loadYouTubeReference()} disabled={working || !youtubeUrl.trim()}>Use URL</button>
          </div>
          <p className="youtube-reference-note">YouTube URLs use the video's official thumbnail for a quick approximate match. Upload a frame for the exact scene.</p>

          {referenceUrl && (
            <div className="look-reference-preview">
              <img src={referenceUrl} alt="Reference look" />
              <div><ImageIcon /><span>{youtubeVideoId ? 'YouTube thumbnail reference' : 'Uploaded reference frame'}</span></div>
              <button onClick={() => { setReference(null); setReferenceUrl(''); setYoutubeVideoId(''); setGeneratedLut(null); }} aria-label="Remove reference"><X /></button>
              {youtubeVideoId && <a href={`https://www.youtube.com/watch?v=${youtubeVideoId}`} target="_blank" rel="noreferrer" title="Open on YouTube"><ExternalLink /></a>}
            </div>
          )}

          <label className="look-strength"><span>Match strength <b>{strength}%</b></span><input type="range" min="10" max="100" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
          <label className="look-check"><input type="checkbox" checked={preserveLuminance} onChange={(event) => setPreserveLuminance(event.target.checked)} /><span>Preserve source exposure</span></label>

          {error && <p className="look-match-error">{error}</p>}
          <button className="look-generate" onClick={() => void matchLook()} disabled={!reference || working}>
            {working ? <LoaderCircle className="spin" /> : <Sparkles />}
            {working ? 'Analyzing colors…' : generatedLut ? 'Regenerate and apply' : 'Generate and apply LUT'}
          </button>
          {generatedLut && <button className="look-download" onClick={downloadLut}><Download /> Download generated .cube</button>}
        </div>
      )}
    </div>
  );
}
