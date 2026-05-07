import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Film, Play, Pause, Rewind, FastForward, X, Type } from 'lucide-react';

interface OverlayItem {
  id: string;
  type: 'text' | 'image' | 'video';
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  startTime: number;
  endTime: number;
}

interface SubtitleItem {
  start: number;
  end: number;
  text: string;
}

interface VideoPreviewProps {
  videoFile: File | null;
  startTime: number;
  endTime: number;
  format: 'youtube' | 'instagram';
  lutFiles: File[];
  onDurationLoaded?: (duration: number) => void;
  speed: number;
  isMuted: boolean;
  overlays: OverlayItem[];
  setOverlays: React.Dispatch<React.SetStateAction<OverlayItem[]>>;
  subtitles: SubtitleItem[];
  objectFit: 'cover' | 'contain';
  selectedOverlayId: string | null;
  setSelectedOverlayId: (id: string | null) => void;
}

// Parse .cube LUT file
function parseCubeFile(text: string): { size: number; data: Uint8Array } | null {
  const lines = text.split('\n');
  let size = 0;
  const colors: number[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('TITLE')) continue;
    if (t.startsWith('LUT_3D_SIZE')) { size = parseInt(t.split(/\s+/)[1], 10); continue; }
    if (t.startsWith('DOMAIN_MIN') || t.startsWith('DOMAIN_MAX')) continue;
    const p = t.split(/\s+/).map(Number);
    if (p.length === 3 && !isNaN(p[0])) {
      // Convert 0.0-1.0 floats to 0-255 bytes for RGBA8 texture
      colors.push(
        Math.round(Math.min(1, Math.max(0, p[0])) * 255),
        Math.round(Math.min(1, Math.max(0, p[1])) * 255),
        Math.round(Math.min(1, Math.max(0, p[2])) * 255),
        255  // alpha
      );
    }
  }
  if (size === 0 || colors.length === 0) return null;
  return { size, data: new Uint8Array(colors) };
}

// WebGL2 LUT renderer with proper error handling
function createLutRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: false });
  if (!gl) return null;

  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, `#version 300 es
    in vec2 a_pos;
    out vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      v_uv.y = 1.0 - v_uv.y;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, `#version 300 es
    precision highp float;
    precision highp sampler3D;
    in vec2 v_uv;
    out vec4 outColor;
    uniform sampler2D u_video;
    uniform sampler3D u_lut1;
    uniform sampler3D u_lut2;
    uniform sampler3D u_lut3;
    uniform int u_lutCount;
    void main() {
      vec4 c = texture(u_video, v_uv);
      if (u_lutCount >= 1) c.rgb = texture(u_lut1, c.rgb).rgb;
      if (u_lutCount >= 2) c.rgb = texture(u_lut2, c.rgb).rgb;
      if (u_lutCount >= 3) c.rgb = texture(u_lut3, c.rgb).rgb;
      outColor = c;
    }
  `);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error('Fragment shader error:', gl.getShaderInfoLog(fs));
    return null;
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('WebGL program link failed');
    return null;
  }

  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const videoTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const lutCountLoc = gl.getUniformLocation(prog, 'u_lutCount');
  gl.uniform1i(lutCountLoc, 0);

  // Set explicit sampler locations during initialization
  gl.uniform1i(gl.getUniformLocation(prog, 'u_video'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_lut1'), 1);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_lut2'), 2);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_lut3'), 3);

  let lut1Tex: WebGLTexture | null = null;
  let lut2Tex: WebGLTexture | null = null;
  let lut3Tex: WebGLTexture | null = null;

  return {
    setLuts(luts: ({ size: number; data: Uint8Array } | null)[]) {
      const activeLuts = luts.filter(l => l !== null);
      gl.uniform1i(lutCountLoc, activeLuts.length);
      
      [lut1Tex, lut2Tex, lut3Tex].forEach((tex) => {
        if (tex) gl.deleteTexture(tex);
      });
      lut1Tex = lut2Tex = lut3Tex = null;

      activeLuts.forEach((lut, i) => {
        const tex = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_3D, tex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, lut!.size, lut!.size, lut!.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut!.data);
        if (i === 0) lut1Tex = tex;
        else if (i === 1) lut2Tex = tex;
        else if (i === 2) lut3Tex = tex;
      });
    },
    render(video: HTMLVideoElement) {
      const c = gl.canvas as HTMLCanvasElement;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      if (c.width !== vw || c.height !== vh) { c.width = vw; c.height = vh; }
      gl.viewport(0, 0, c.width, c.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      
      if (lut1Tex) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, lut1Tex); }
      if (lut2Tex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, lut2Tex); }
      if (lut3Tex) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, lut3Tex); }
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(videoTex);
      [lut1Tex, lut2Tex, lut3Tex].forEach(t => t && gl.deleteTexture(t));
      gl.deleteProgram(prog);
    },
  };
}

type LutRendererType = ReturnType<typeof createLutRenderer>;
type VideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({
  videoFile, startTime, endTime, format, lutFiles, onDurationLoaded,
  speed, isMuted, overlays, setOverlays, subtitles,
  objectFit, selectedOverlayId, setSelectedOverlayId
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LutRendererType>(null);
  const rafRef = useRef(0);
  const videoFrameRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  const [videoUrl, setVideoUrl] = useState('');
  const [lutCount, setLutCount] = useState(0);
  const [splitPos, setSplitPos] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);

  // Mount/unmount
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      const v = videoRef.current as VideoFrameElement | null;
      if (videoFrameRef.current !== null && v?.cancelVideoFrameCallback) {
        v.cancelVideoFrameCallback(videoFrameRef.current);
      }
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Video URL
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const v = videoRef.current as VideoFrameElement | null;
    if (videoFrameRef.current !== null && v?.cancelVideoFrameCallback) {
      v.cancelVideoFrameCallback(videoFrameRef.current);
      videoFrameRef.current = null;
    }
    rendererRef.current?.dispose();
    rendererRef.current = null;
    setLutCount(0);
    setSplitPos(50);
    setPlaying(false);
    setTime(0);

    if (videoFile) {
      const u = URL.createObjectURL(videoFile);
      setVideoUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setVideoUrl('');
  }, [videoFile]);

  // Video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;

      const onMeta = () => {
      if (!aliveRef.current) return;
      onDurationLoaded?.(v.duration);
      v.currentTime = startTime;
    };
    const onTime = () => {
      if (!aliveRef.current) return;
      setTime(v.currentTime);
      if (v.currentTime >= endTime) v.currentTime = startTime;
    };
    const onPlay = () => aliveRef.current && setPlaying(true);
    const onPause = () => aliveRef.current && setPlaying(false);

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [videoUrl, startTime, endTime, onDurationLoaded]);

  // Parse LUTs
  useEffect(() => {
    if (lutFiles.length === 0) {
      rendererRef.current?.setLuts([]);
      setLutCount(0);
      return;
    }

    const loadAll = async () => {
      const parsed = await Promise.all(lutFiles.map(file => {
        return new Promise<{size: number, data: Uint8Array} | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(parseCubeFile(e.target?.result as string));
          reader.readAsText(file);
        });
      }));

      if (!aliveRef.current) return;
      if (!rendererRef.current && canvasRef.current) {
        rendererRef.current = createLutRenderer(canvasRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.setLuts(parsed);
        setLutCount(parsed.filter(Boolean).length);
        if (videoRef.current?.readyState && videoRef.current.readyState >= 2) {
          rendererRef.current.render(videoRef.current);
        }
      }
    };
    loadAll();
  }, [lutFiles]);

  const cancelLutPreviewLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const v = videoRef.current as VideoFrameElement | null;
    if (videoFrameRef.current !== null && v?.cancelVideoFrameCallback) {
      v.cancelVideoFrameCallback(videoFrameRef.current);
      videoFrameRef.current = null;
    }
  }, []);

  const renderLutFrame = useCallback(() => {
    if (!aliveRef.current) return;
    const v = videoRef.current;
    const r = rendererRef.current;
    if (v && r && v.readyState >= 2) {
      r.render(v);
    }
  }, []);

  const scheduleLutPreviewFrame = useCallback(() => {
    if (!aliveRef.current) return;
    const v = videoRef.current as VideoFrameElement | null;
    if (!v || v.paused || lutCount === 0) return;

    if (v.requestVideoFrameCallback) {
      videoFrameRef.current = v.requestVideoFrameCallback(() => {
        videoFrameRef.current = null;
        renderLutFrame();
        scheduleLutPreviewFrame();
      });
      return;
    }

    rafRef.current = requestAnimationFrame(() => {
      renderLutFrame();
      scheduleLutPreviewFrame();
    });
  }, [lutCount, renderLutFrame]);

  useEffect(() => {
    cancelLutPreviewLoop();
    if (lutCount > 0 && playing) {
      scheduleLutPreviewFrame();
    } else if (lutCount > 0) {
      renderLutFrame();
    }
    return cancelLutPreviewLoop;
  }, [lutCount, playing, cancelLutPreviewLoop, renderLutFrame, scheduleLutPreviewFrame]);

  // Apply speed and mute when they change
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      videoRef.current.muted = isMuted;
    }
  }, [speed, isMuted, videoUrl]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const skipBack = () => {
    if (videoRef.current) videoRef.current.currentTime -= 10;
  };
  const skipForward = () => {
    if (videoRef.current) videoRef.current.currentTime += 10;
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !trimmedDuration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = startTime + (Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * trimmedDuration);
  };

  const relativeTime = Math.max(0, time - startTime);
  const trimmedDuration = Math.max(0.1, endTime - startTime);
  const pct = (relativeTime / trimmedDuration) * 100;
  const currentSubtitle = subtitles.find(s => time >= s.start && time <= s.end);

  const handleDrag = (_id: string, e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingId) return;
    const viewport = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = ((clientX - viewport.left) / viewport.width) * 100;
    const y = ((clientY - viewport.top) / viewport.height) * 100;
    
    setOverlays(overlays.map(ov => ov.id === draggingId ? { ...ov, x, y } : ov));
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (resizingId) {
        const viewport = videoRef.current?.parentElement?.getBoundingClientRect();
        if (!viewport) return;
        
        const ov = overlays.find((o) => o.id === resizingId);
        if (!ov) return;
        
        // Calculate distance from mouse to center of overlay (ov.x, ov.y) in percent
        const centerX = (ov.x / 100) * viewport.width;
        const centerY = (ov.y / 100) * viewport.height;
        
        const dx = Math.abs(e.clientX - viewport.left - centerX);
        const dy = Math.abs(e.clientY - viewport.top - centerY);
        
        const newWidth = (dx * 2 / viewport.width) * 100;
        const newHeight = (dy * 2 / viewport.height) * 100;
        
        setOverlays((prev) => prev.map((o) => o.id === resizingId ? { 
          ...o, 
          width: Math.max(5, newWidth), 
          height: Math.max(2, newHeight) 
        } : o));
      }
    };

    const handleWindowMouseUp = () => {
      setDraggingId(null);
      setResizingId(null);
    };

    if (draggingId || resizingId) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [draggingId, resizingId, overlays]);
  
  return (
    <div className="preview-panel fade-up">
      <div className="preview-viewport">
        {videoUrl ? (
          <div 
            className={`preview-frame ${format === 'instagram' ? 'fmt-instagram' : 'fmt-youtube'}`}
            onMouseMove={(e) => draggingId && handleDrag(draggingId, e)}
            onMouseUp={() => setDraggingId(null)}
            onTouchMove={(e) => draggingId && handleDrag(draggingId, e)}
            onTouchEnd={() => setDraggingId(null)}
            style={{ 
              overflow: 'hidden'
            }}
          >
            <div style={{ 
              width: '100%', 
              height: '100%'
            }}>
              <video
                ref={videoRef}
                src={videoUrl || undefined}
                loop playsInline preload="metadata"
                style={{ display: 'block', width: '100%', height: '100%', objectFit }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  display: lutCount > 0 ? 'block' : 'none',
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit,
                  clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)`
                }}
              />
            </div>

            <div className="preview-badge" style={{ zIndex: 20 }}>
              <span className="preview-badge-dot" />
              {lutCount > 0 ? `${lutCount} LUT${lutCount > 1 ? 's' : ''} Applied` : 'Live'}
            </div>

            {/* Overlays Rendering */}
            {overlays.filter((ov) => time >= ov.startTime && time <= ov.endTime).map((ov) => {
              const isSelected = selectedOverlayId === ov.id;
              return (
                <div
                  key={ov.id}
                  id={`ov-${ov.id}`}
                  onMouseDown={(e) => { e.stopPropagation(); setSelectedOverlayId(ov.id); setDraggingId(ov.id); }}
                  onTouchStart={(e) => { e.stopPropagation(); setSelectedOverlayId(ov.id); setDraggingId(ov.id); }}
                  style={{
                    position: 'absolute',
                    left: `${ov.x}%`,
                    top: `${ov.y}%`,
                    width: `${ov.width || 30}%`,
                    height: `${ov.height || (ov.type === 'text' ? 10 : 30)}%`,
                    transform: 'translate(-50%, -50%)',
                    cursor: draggingId === ov.id ? 'grabbing' : 'grab',
                    zIndex: 30,
                    userSelect: 'none',
                    border: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    borderRadius: '4px',
                    pointerEvents: (draggingId && draggingId !== ov.id) || resizingId ? 'none' : 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}
                >
                  {/* Selection Handles */}
                  {isSelected && (
                    <>
                      <button 
                        className="ov-handle ov-handle-tr" 
                        onMouseDown={(e) => { e.stopPropagation(); setOverlays(overlays.filter(o => o.id !== ov.id)); setSelectedOverlayId(null); }}
                      >
                        <X style={{ width: 10, height: 10 }} />
                      </button>
                      <div 
                        className="ov-handle ov-handle-br" 
                        onMouseDown={(e) => { e.stopPropagation(); setResizingId(ov.id); }}
                      />
                      <button 
                        className="ov-handle ov-handle-tl"
                        onMouseDown={(e) => { 
                          e.stopPropagation(); 
                          const newText = prompt("Edit text:", ov.content);
                          if (newText) setOverlays(overlays.map(o => o.id === ov.id ? { ...o, content: newText } : o));
                        }}
                      >
                        <Type style={{ width: 10, height: 10 }} />
                      </button>
                    </>
                  )}

                  {ov.type === 'text' && (
                    <span style={{
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: format === 'youtube' ? '3vw' : '6vw',
                      textShadow: '0px 0px 10px rgba(0,0,0,0.8)',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      padding: '10px'
                    }}>
                      {ov.content}
                    </span>
                  )}
                  {ov.type === 'image' && (
                    <img src={ov.content} alt="" style={{ width: '100%', height: '100%', pointerEvents: 'none', borderRadius: '4px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }} />
                  )}
                  {ov.type === 'video' && (
                    <video src={ov.content} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', pointerEvents: 'none', borderRadius: '4px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }} />
                  )}
                </div>
              );
            })}

            {/* Subtitles Rendering */}
            {currentSubtitle && (
              <div style={{
                position: 'absolute',
                bottom: '15%',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 40,
                width: '80%',
                display: 'flex',
                justifyContent: 'center'
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontSize: format === 'youtube' ? '1.2rem' : '1rem',
                  textAlign: 'center',
                  backdropFilter: 'blur(4px)',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                }}>
                  {currentSubtitle.text}
                </div>
              </div>
            )}

            {lutCount > 0 && (
              <>
                <div className="split-line" style={{ left: `${splitPos}%` }} />
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={splitPos} 
                  onChange={(e) => setSplitPos(Number(e.target.value))}
                  className="split-slider" 
                />
              </>
            )}
          </div>
        ) : (
          <div className="preview-placeholder">
            <Film style={{ width: 40, height: 40, opacity: 0.25 }} />
            <p>Drop a video or click upload</p>
            <span>MP4 · MOV · WebM</span>
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="timeline" style={{ justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="tl-btn" onClick={skipBack}>
              <Rewind style={{ width: 14, height: 14 }} />
            </button>
            <button className="tl-btn" onClick={togglePlay}>
              {playing
                ? <Pause style={{ width: 14, height: 14 }} />
                : <Play style={{ width: 14, height: 14 }} />}
            </button>
            <button className="tl-btn" onClick={skipForward}>
              <FastForward style={{ width: 14, height: 14 }} />
            </button>
          </div>
          
          <div className="tl-track" onClick={seek} style={{ marginLeft: '1rem', flex: 1 }}>
            <div className="tl-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="tl-time">{fmt(relativeTime)} / {fmt(trimmedDuration)}</span>
        </div>
      )}

      {videoFile && (
        <div className="file-info">
          <span className="file-info-dot" />
          <span className="file-info-text"><strong>{videoFile.name}</strong></span>
        </div>
      )}
    </div>
  );
};

export default VideoPreview;
