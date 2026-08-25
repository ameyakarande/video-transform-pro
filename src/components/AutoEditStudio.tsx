import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Bot, Check, Download, Film, GripVertical, LoaderCircle, Play, Plus, RotateCcw, Sparkles, Trash2, Upload, WandSparkles } from 'lucide-react';
import type { AnalyzedClip, AutoEditBrief, StoryRole, StoryShot } from '../types/autoEdit';
import { analyzeClip, createStoryline } from '../utils/autoEditAnalysis';
import { processAutoEditSequence } from '../utils/ffmpegUtils';

interface Props { onBack: () => void; onOpenClip: (file: File) => void; }
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

export default function AutoEditStudio({ onBack, onOpenClip }: Props) {
  const [clips, setClips] = useState<AnalyzedClip[]>([]);
  const [shots, setShots] = useState<StoryShot[]>([]);
  const [brief, setBrief] = useState<AutoEditBrief>({ prompt: '', style: 'cinematic', targetDuration: 30, format: 'youtube' });
  const [selectedShotId, setSelectedShotId] = useState('');
  const [analyzing, setAnalyzing] = useState(false); const [analysisProgress, setAnalysisProgress] = useState(0);
  const [exporting, setExporting] = useState(false); const [exportProgress, setExportProgress] = useState(0); const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipsRef = useRef<AnalyzedClip[]>([]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => () => clipsRef.current.forEach((clip) => URL.revokeObjectURL(clip.url)), []);

  const selectedShot = shots.find((shot) => shot.id === selectedShotId) || shots[0];
  const selectedClip = clips.find((clip) => clip.id === selectedShot?.clipId);
  const totalDuration = shots.reduce((sum, shot) => sum + Math.max(0, shot.end - shot.start), 0);
  const qualityAverage = clips.length ? Math.round(clips.reduce((sum, clip) => sum + clip.quality, 0) / clips.length) : 0;
  const canGenerate = clips.length >= 2 && brief.prompt.trim().length >= 6;
  const clipMap = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);

  useEffect(() => {
    const video = videoRef.current; if (!video || !selectedShot) return;
    const onLoaded = () => { video.currentTime = selectedShot.start; };
    const onTime = () => { if (video.currentTime >= selectedShot.end) video.pause(); };
    video.addEventListener('loadedmetadata', onLoaded); video.addEventListener('timeupdate', onTime);
    return () => { video.removeEventListener('loadedmetadata', onLoaded); video.removeEventListener('timeupdate', onTime); };
  }, [selectedShot, selectedClip]);

  const addFiles = async (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith('video/')).slice(0, Math.max(0, 20 - clips.length));
    if (!accepted.length) return;
    setAnalyzing(true); setError(''); setAnalysisProgress(0);
    try {
      const analyzed: AnalyzedClip[] = [];
      for (let index = 0; index < accepted.length; index += 1) { analyzed.push(await analyzeClip(accepted[index])); setAnalysisProgress((index + 1) / accepted.length); }
      setClips((current) => [...current, ...analyzed]); setShots([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Clip analysis failed.'); }
    finally { setAnalyzing(false); }
  };

  const generate = () => { const next = createStoryline(clips, brief); setShots(next); setSelectedShotId(next[0]?.id || ''); };
  const move = (index: number, direction: -1 | 1) => setShots((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const updateShot = (id: string, patch: Partial<StoryShot>) => setShots((current) => current.map((shot) => shot.id === id ? { ...shot, ...patch } : shot));
  const removeClip = (id: string) => { const clip = clipMap.get(id); if (clip) URL.revokeObjectURL(clip.url); setClips((current) => current.filter((item) => item.id !== id)); setShots((current) => current.filter((shot) => shot.clipId !== id)); };
  const exportFirstCut = async () => {
    if (!shots.length) return; setExporting(true); setError(''); setExportProgress(0);
    try { const blob = await processAutoEditSequence(clips, shots, brief.format, setExportProgress); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cinemaster-first-cut-${Date.now()}.mp4`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'First-cut export failed.'); }
    finally { setExporting(false); }
  };

  return <main className="auto-edit-page">
    <div className="auto-edit-topbar"><button onClick={onBack}><ArrowLeft /> Manual editor</button><div><span><WandSparkles /></span><div><strong>AI Auto Edit</strong><small>Turn raw clips into an editable first cut</small></div></div><div className="auto-edit-status"><span>{clips.length}/20 clips</span><span>{time(totalDuration)} cut</span></div></div>
    <div className="auto-edit-grid">
      <aside className="auto-media-panel">
        <div className="auto-panel-title"><div><strong>Media</strong><small>Local analysis · originals stay in browser</small></div><label><Plus /><input hidden multiple type="file" accept="video/*" onChange={(event) => { void addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></label></div>
        {!clips.length && <label className="auto-dropzone"><Upload /><strong>Upload your raw footage</strong><span>Select 2–20 video clips</span><input hidden multiple type="file" accept="video/*" onChange={(event) => void addFiles(Array.from(event.target.files || []))} /></label>}
        {analyzing && <div className="auto-analysis-progress"><LoaderCircle className="spin" /><span>Inspecting footage… {Math.round(analysisProgress * 100)}%</span><i style={{ width: `${analysisProgress * 100}%` }} /></div>}
        <div className="auto-media-list">{clips.map((clip) => <article key={clip.id} className="auto-media-card"><img src={clip.thumbnail} /><div><strong>{clip.file.name}</strong><span>{time(clip.duration)} · {clip.width}×{clip.height}</span><small><b>{clip.quality}</b> quality · {clip.motion > .55 ? 'high motion' : clip.motion > .25 ? 'balanced motion' : 'steady'}</small></div><button onClick={() => removeClip(clip.id)} aria-label="Remove clip"><Trash2 /></button></article>)}</div>
      </aside>

      <section className="auto-workspace">
        <div className="auto-preview">{selectedClip ? <><video ref={videoRef} key={selectedClip.id} src={selectedClip.url} controls /><div className="auto-preview-badge"><Play /> {selectedShot?.role} · {time(selectedShot?.start || 0)}–{time(selectedShot?.end || 0)}</div></> : <div className="auto-preview-empty"><Film /><span>Your generated sequence will preview here</span></div>}</div>
        <div className="auto-story-header"><div><strong>Editable first cut</strong><small>{shots.length ? `${shots.length} shots · ${time(totalDuration)}` : 'Generate a story to build the sequence'}</small></div>{shots.length > 0 && <><button onClick={generate}><RotateCcw /> Regenerate</button><button className="auto-export" disabled={exporting} onClick={() => void exportFirstCut()}>{exporting ? <LoaderCircle className="spin" /> : <Download />}{exporting ? `${Math.round(exportProgress * 100)}%` : 'Export first cut'}</button></>}</div>
        <div className="auto-timeline">{shots.map((shot, index) => { const clip = clipMap.get(shot.clipId); if (!clip) return null; return <article key={shot.id} className={`auto-story-shot ${selectedShot?.id === shot.id ? 'active' : ''}`} onClick={() => setSelectedShotId(shot.id)}><GripVertical /><img src={clip.thumbnail} /><div className="auto-shot-main"><div><span className={`role-${shot.role}`}>{shot.role}</span><strong>{clip.file.name}</strong></div><input value={shot.note} onChange={(event) => updateShot(shot.id, { note: event.target.value })} onClick={(event) => event.stopPropagation()} /></div><div className="auto-shot-trim"><label>In<input type="number" min="0" max={shot.end - .2} step=".1" value={shot.start.toFixed(1)} onChange={(event) => updateShot(shot.id, { start: Math.max(0, Number(event.target.value)) })} /></label><label>Out<input type="number" min={shot.start + .2} max={clip.duration} step=".1" value={shot.end.toFixed(1)} onChange={(event) => updateShot(shot.id, { end: Math.min(clip.duration, Number(event.target.value)) })} /></label></div><select value={shot.role} onChange={(event) => updateShot(shot.id, { role: event.target.value as StoryRole })}><option value="hook">Hook</option><option value="setup">Setup</option><option value="development">Development</option><option value="highlight">Highlight</option><option value="ending">Ending</option></select><div className="auto-shot-actions"><button disabled={index === 0} onClick={(event) => { event.stopPropagation(); move(index, -1); }}><ArrowUp /></button><button disabled={index === shots.length - 1} onClick={(event) => { event.stopPropagation(); move(index, 1); }}><ArrowDown /></button><button onClick={(event) => { event.stopPropagation(); setShots((current) => current.filter((item) => item.id !== shot.id)); }}><Trash2 /></button></div></article>; })}</div>
      </section>

      <aside className="auto-brief-panel"><div className="auto-ai-heading"><span><Bot /></span><div><strong>Creative brief</strong><small>Tell the editor what to make</small></div></div><label className="auto-field"><span>What should the video communicate?</span><textarea value={brief.prompt} onChange={(event) => setBrief({ ...brief, prompt: event.target.value })} placeholder="Example: Create an energetic 45-second recap that opens with the crowd, builds toward the performance, and ends on the celebration." /></label><label className="auto-field"><span>Editing style</span><select value={brief.style} onChange={(event) => setBrief({ ...brief, style: event.target.value as AutoEditBrief['style'] })}><option value="cinematic">Cinematic story</option><option value="energetic">Fast & energetic</option><option value="documentary">Documentary</option><option value="social">Social highlight</option></select></label><label className="auto-field"><span>Target duration</span><div className="auto-duration-options">{[15, 30, 60, 90].map((value) => <button key={value} className={brief.targetDuration === value ? 'active' : ''} onClick={() => setBrief({ ...brief, targetDuration: value })}>{value}s</button>)}</div></label><label className="auto-field"><span>Output</span><div className="auto-duration-options"><button className={brief.format === 'youtube' ? 'active' : ''} onClick={() => setBrief({ ...brief, format: 'youtube' })}>16:9</button><button className={brief.format === 'instagram' ? 'active' : ''} onClick={() => setBrief({ ...brief, format: 'instagram' })}>9:16</button></div></label>{clips.length > 0 && <div className="auto-insights"><strong>Footage insights</strong><span><Check /> {clips.length} usable clips</span><span><Check /> {qualityAverage}% average quality</span><span><Check /> {time(clips.reduce((sum, clip) => sum + clip.duration, 0))} source footage</span></div>}{error && <p className="look-match-error">{error}</p>}<button className="auto-generate" disabled={!canGenerate || analyzing} onClick={generate}><Sparkles />{shots.length ? 'Create a new storyline' : 'Analyze story & create first cut'}</button>{!canGenerate && <small className="auto-requirement">Add at least two clips and describe the intended story.</small>}{selectedClip && <button className="auto-manual" onClick={() => onOpenClip(selectedClip.file)}>Open selected clip in manual editor</button>}</aside>
    </div>
  </main>;
}
