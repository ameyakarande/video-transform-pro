import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Check, Download, Expand, Film, LoaderCircle, Pause, Play, Plus, RotateCcw, Sparkles, Trash2, Upload, X } from 'lucide-react';
import type { AnalyzedClip, AutoEditBrief, StoryShot } from '../types/autoEdit';
import { analyzeClip, createStoryline } from '../utils/autoEditAnalysis';
import { processAutoEditSequence } from '../utils/ffmpegUtils';

interface Props { onBack: () => void; }
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

export default function AutoEditStudio({ onBack }: Props) {
  const [clips, setClips] = useState<AnalyzedClip[]>([]);
  const [shots, setShots] = useState<StoryShot[]>([]);
  const [brief, setBrief] = useState<AutoEditBrief>({ prompt: '', style: 'cinematic', targetDuration: 30, format: 'youtube' });
  const [selectedShotId, setSelectedShotId] = useState(''); const [playing, setPlaying] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(''); const [generating, setGenerating] = useState(false); const [generateProgress, setGenerateProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false); const [analysisProgress, setAnalysisProgress] = useState(0);
  const [exporting, setExporting] = useState(false); const [exportProgress, setExportProgress] = useState(0); const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null); const previewRef = useRef<HTMLDivElement>(null);
  const clipsRef = useRef<AnalyzedClip[]>([]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => () => { clipsRef.current.forEach((clip) => URL.revokeObjectURL(clip.url)); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selectedShot = shots.find((shot) => shot.id === selectedShotId) || shots[0];
  const selectedClip = clips.find((clip) => clip.id === selectedShot?.clipId);
  const totalDuration = shots.reduce((sum, shot) => sum + Math.max(0, shot.end - shot.start), 0);
  const qualityAverage = clips.length ? Math.round(clips.reduce((sum, clip) => sum + clip.quality, 0) / clips.length) : 0;
  const canGenerate = clips.length >= 2 && brief.prompt.trim().length >= 6;
  const clipMap = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);

  useEffect(() => {
    const video = videoRef.current; if (!video || !selectedShot || previewUrl) return;
    const onLoaded = () => { video.currentTime = selectedShot.start; };
    const onTime = () => { if (video.currentTime >= selectedShot.end) video.pause(); };
    video.addEventListener('loadedmetadata', onLoaded); video.addEventListener('timeupdate', onTime);
    return () => { video.removeEventListener('loadedmetadata', onLoaded); video.removeEventListener('timeupdate', onTime); };
  }, [selectedShot, selectedClip, previewUrl]);

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

  const generate = async () => {
    const next = createStoryline(clips, brief); setShots(next); setSelectedShotId(next[0]?.id || ''); setGenerating(true); setGenerateProgress(0); setError('');
    try { const blob = await processAutoEditSequence(clips, next, brief.format, setGenerateProgress, true); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(URL.createObjectURL(blob)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not build the generated preview.'); }
    finally { setGenerating(false); }
  };
  const togglePlayback = () => { const video = videoRef.current; if (!video) return; if (video.paused) { if (!previewUrl && selectedShot && (video.currentTime < selectedShot.start || video.currentTime >= selectedShot.end)) video.currentTime = selectedShot.start; void video.play(); } else video.pause(); };
  const removeClip = (id: string) => { const clip = clipMap.get(id); if (clip) URL.revokeObjectURL(clip.url); setClips((current) => current.filter((item) => item.id !== id)); setShots((current) => current.filter((shot) => shot.clipId !== id)); };
  const exportFirstCut = async () => {
    if (!shots.length) return; setExporting(true); setError(''); setExportProgress(0);
    try { const blob = await processAutoEditSequence(clips, shots, brief.format, setExportProgress); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cinemaster-first-cut-${Date.now()}.mp4`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'First-cut export failed.'); }
    finally { setExporting(false); }
  };

  return <main className="auto-edit-page auto-classic">
    <section className="auto-classic-stage">
      <div className="auto-classic-canvas" ref={previewRef}>
        {generating ? <div className="auto-rendering"><LoaderCircle className="spin" /><strong>Building your AI first cut</strong><span>Assembling the proposed movie… {Math.round(generateProgress * 100)}%</span><i><b style={{ width: `${generateProgress * 100}%` }} /></i></div>
          : previewUrl || selectedClip ? <><video ref={videoRef} key={previewUrl || selectedClip?.id} src={previewUrl || selectedClip?.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onClick={togglePlayback} /><button className="auto-preview-play" onClick={togglePlayback}>{playing ? <Pause /> : <Play />}</button><button className="auto-preview-fullscreen" onClick={() => void previewRef.current?.requestFullscreen()}><Expand /> Fullscreen</button>{previewUrl && <div className="auto-generated-badge"><Sparkles /> AI generated first-cut preview · {time(totalDuration)}</div>}</>
          : <label className="auto-classic-empty"><Film /><strong>Upload your footage to create a movie</strong><span>MP4 · MOV · WebM · Select 2–20 clips</span><input hidden multiple type="file" accept="video/*" onChange={(event) => void addFiles(Array.from(event.target.files || []))} /></label>}
      </div>
      {shots.length > 0 && <div className="auto-cut-strip"><div className="auto-cut-strip-head"><div><strong>AI first cut</strong><span>{shots.length} shots · {time(totalDuration)}</span></div><button onClick={() => void generate()}><RotateCcw /> Rebuild preview</button></div><div className="auto-cut-cards">{shots.map((shot, index) => { const clip = clipMap.get(shot.clipId); if (!clip) return null; return <article key={shot.id} className={selectedShot?.id === shot.id ? 'active' : ''} onClick={() => setSelectedShotId(shot.id)}><img src={clip.thumbnail} /><span>{index + 1}</span><small>{shot.role}</small><button onClick={(event) => { event.stopPropagation(); setShots((current) => current.filter((item) => item.id !== shot.id)); setPreviewUrl(''); }}><X /></button></article>; })}</div></div>}
    </section>
    <aside className="auto-classic-controls">
      <div className="auto-control-section"><div className="auto-control-title"><span><Upload /></span><div><strong>Source videos</strong><small>{clips.length ? `${clips.length} clips added` : 'Add your raw footage'}</small></div><label><Plus /><input hidden multiple type="file" accept="video/*" onChange={(event) => { void addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></label></div>{!clips.length && <label className="auto-side-upload"><Upload /> Upload multiple video files<input hidden multiple type="file" accept="video/*" onChange={(event) => void addFiles(Array.from(event.target.files || []))} /></label>}{analyzing && <div className="auto-analysis-progress"><LoaderCircle className="spin" /><span>Inspecting footage… {Math.round(analysisProgress * 100)}%</span><i style={{ width: `${analysisProgress * 100}%` }} /></div>}<div className="auto-source-grid">{clips.map((clip) => <article key={clip.id}><img src={clip.thumbnail} /><div><strong>{clip.file.name}</strong><span>{time(clip.duration)} · quality {clip.quality}</span></div><button onClick={() => removeClip(clip.id)}><Trash2 /></button></article>)}</div></div>
      <div className="auto-control-section"><div className="auto-control-title"><span><Bot /></span><div><strong>AI creative brief</strong><small>Describe the movie you want</small></div></div><label className="auto-field"><textarea value={brief.prompt} onChange={(event) => setBrief({ ...brief, prompt: event.target.value })} placeholder="Create a cinematic travel film with a strong opening, natural progression and memorable ending." /></label><label className="auto-field"><span>Editing style</span><select value={brief.style} onChange={(event) => setBrief({ ...brief, style: event.target.value as AutoEditBrief['style'] })}><option value="cinematic">Cinematic story</option><option value="energetic">Fast & energetic</option><option value="documentary">Documentary</option><option value="social">Social highlight</option></select></label></div>
      <div className="auto-control-section"><div className="auto-control-title simple"><strong>Output & duration</strong></div><div className="auto-format-row"><button className={brief.format === 'youtube' ? 'active' : ''} onClick={() => setBrief({ ...brief, format: 'youtube' })}><Play /> 16:9</button><button className={brief.format === 'instagram' ? 'active' : ''} onClick={() => setBrief({ ...brief, format: 'instagram' })}>▯ 9:16</button></div><div className="auto-duration-options">{[15, 30, 60, 90].map((value) => <button key={value} className={brief.targetDuration === value ? 'active' : ''} onClick={() => setBrief({ ...brief, targetDuration: value })}>{value}s</button>)}</div></div>
      {clips.length > 0 && <div className="auto-control-section"><div className="auto-insights"><strong>Footage insights</strong><span><Check /> {clips.length} usable clips</span><span><Check /> {qualityAverage}% average quality</span><span><Check /> {time(clips.reduce((sum, clip) => sum + clip.duration, 0))} source footage</span></div></div>}
      <div className="auto-control-actions">{error && <p className="look-match-error">{error}</p>}<button className="auto-generate" disabled={!canGenerate || analyzing || generating} onClick={() => void generate()}>{generating ? <LoaderCircle className="spin" /> : <Sparkles />}{generating ? `Creating preview ${Math.round(generateProgress * 100)}%` : previewUrl ? 'Generate a new first cut' : 'Create AI video preview'}</button>{previewUrl && <button className="auto-export" disabled={exporting} onClick={() => void exportFirstCut()}>{exporting ? <LoaderCircle className="spin" /> : <Download />}{exporting ? `Exporting ${Math.round(exportProgress * 100)}%` : 'Export final video'}</button>}<button className="auto-back" onClick={onBack}><ArrowLeft /> Back to manual editor</button></div>
    </aside>
  </main>;
}
