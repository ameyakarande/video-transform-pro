import { useEffect, useState } from 'react';
import { BrainCircuit, Download, ExternalLink, Image as ImageIcon, Link2, LoaderCircle, Sparkles, Upload, X } from 'lucide-react';
import { generateMatchedLut, parseYouTubeVideoId } from '../utils/lookMatcher';
import { generateAiLookLut, type AiLookRecipe } from '../utils/aiLookRecipe';

interface LookMatcherProps { sourceVideo: File; sourceTime: number; onApply: (file: File) => void; }

export default function LookMatcher({ sourceVideo, sourceTime, onApply }: LookMatcherProps) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState<Blob | null>(null);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeVideoId, setYoutubeVideoId] = useState('');
  const [recipe, setRecipe] = useState<AiLookRecipe | null>(null);
  const [strength, setStrength] = useState(80);
  const [preserveLuminance, setPreserveLuminance] = useState(true);
  const [generatedLut, setGeneratedLut] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (referenceUrl.startsWith('blob:')) URL.revokeObjectURL(referenceUrl); }, [referenceUrl]);

  const setReferenceBlob = (blob: Blob, previewUrl: string) => {
    if (referenceUrl.startsWith('blob:')) URL.revokeObjectURL(referenceUrl);
    setReference(blob); setReferenceUrl(previewUrl); setRecipe(null); setYoutubeVideoId(''); setGeneratedLut(null); setError('');
  };

  const analyzeYouTubeVideo = async () => {
    const videoId = parseYouTubeVideoId(youtubeUrl);
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) { setError('Enter a valid public YouTube video or Shorts URL.'); return; }
    setWorking(true); setError(''); setRecipe(null); setReference(null); setReferenceUrl(''); setGeneratedLut(null);
    try {
      const response = await fetch('/api/analyze-youtube-look', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: youtubeUrl.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'The video could not be analyzed.');
      setRecipe(result.recipe); setYoutubeVideoId(videoId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The video could not be analyzed.');
    } finally { setWorking(false); }
  };

  const matchLook = async () => {
    if (!reference && !recipe) return;
    setWorking(true); setError('');
    try {
      const lut = recipe
        ? generateAiLookLut(recipe, strength / 100, preserveLuminance)
        : await generateMatchedLut(sourceVideo, sourceTime, reference as Blob, { strength: strength / 100, preserveLuminance });
      setGeneratedLut(lut); onApply(lut);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Look matching failed.'); }
    finally { setWorking(false); }
  };

  const clearReference = () => {
    if (referenceUrl.startsWith('blob:')) URL.revokeObjectURL(referenceUrl);
    setReference(null); setReferenceUrl(''); setRecipe(null); setYoutubeVideoId(''); setGeneratedLut(null); setError('');
  };

  const downloadLut = () => {
    if (!generatedLut) return;
    const url = URL.createObjectURL(generatedLut); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = generatedLut.name; anchor.click(); URL.revokeObjectURL(url);
  };

  return <div className="look-matcher">
    <button className="look-match-launch" onClick={() => setOpen((current) => !current)}>
      <span><Sparkles /></span><div><strong>Match a reference look</strong><small>Create a LUT from a frame or let AI watch a YouTube video</small></div><b>{open ? '−' : '+'}</b>
    </button>
    {open && <div className="look-match-panel">
      <div className="look-source-tabs"><label><Upload /><span>Upload reference frame</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) setReferenceBlob(file, URL.createObjectURL(file)); event.target.value = ''; }} /></label></div>
      <div className="look-source-divider"><span>or analyze the actual video</span></div>
      <div className="youtube-reference-entry"><div><Link2 /><input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="Paste public YouTube URL" /></div><button onClick={() => void analyzeYouTubeVideo()} disabled={working || !youtubeUrl.trim()}>{working ? 'Watching…' : 'Analyze'}</button></div>
      <p className="youtube-reference-note">Google Gemini watches the public video directly. Cinemaster does not download or scrape it. Analysis samples the timeline and reconstructs the recurring grade.</p>

      {referenceUrl && <div className="look-reference-preview"><img src={referenceUrl} alt="Reference look" /><div><ImageIcon /><span>Uploaded reference frame</span></div><button onClick={clearReference} aria-label="Remove reference"><X /></button></div>}
      {recipe && <div className="ai-look-result">
        <div className="ai-look-result-head"><span><BrainCircuit /></span><div><strong>{recipe.name}</strong><small>AI whole-video color analysis</small></div><button onClick={clearReference} aria-label="Remove analysis"><X /></button>{youtubeVideoId && <a href={`https://www.youtube.com/watch?v=${youtubeVideoId}`} target="_blank" rel="noreferrer" title="Open on YouTube"><ExternalLink /></a>}</div>
        <p>{recipe.summary}</p>
        <div className="ai-look-meta"><span>{Math.round(recipe.confidence * 100)}% consistency</span><span>~1 FPS visual sampling</span></div>
        <div className="ai-look-timestamps">Representative shots: {recipe.representative_timestamps.join(' · ')}</div>
        <div className="ai-look-chips"><span>Temp {recipe.temperature > 0 ? '+' : ''}{Math.round(recipe.temperature)}</span><span>Contrast {recipe.contrast > 0 ? '+' : ''}{Math.round(recipe.contrast)}</span><span>Saturation {recipe.saturation > 0 ? '+' : ''}{Math.round(recipe.saturation)}</span><span>Teal/orange {Math.round(recipe.teal_orange)}</span></div>
      </div>}

      <label className="look-strength"><span>Match strength <b>{strength}%</b></span><input type="range" min="10" max="100" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
      <label className="look-check"><input type="checkbox" checked={preserveLuminance} onChange={(event) => setPreserveLuminance(event.target.checked)} /><span>Preserve source exposure</span></label>
      {recipe && (recipe.grain > 10 || recipe.halation > 10 || recipe.vignette > 10) && <p className="youtube-reference-note">The LUT recreates color and tone. Detected texture: grain {Math.round(recipe.grain)}, halation {Math.round(recipe.halation)}, vignette {Math.round(recipe.vignette)}. These require separate effects and are not baked into a LUT.</p>}
      {error && <p className="look-match-error">{error}</p>}
      <button className="look-generate" onClick={() => void matchLook()} disabled={(!reference && !recipe) || working}>{working ? <LoaderCircle className="spin" /> : <Sparkles />}{working ? (recipe || reference ? 'Building LUT…' : 'Watching video…') : generatedLut ? 'Regenerate and apply' : 'Generate and apply LUT'}</button>
      {generatedLut && <button className="look-download" onClick={downloadLut}><Download /> Download generated .cube</button>}
    </div>}
  </div>;
}
