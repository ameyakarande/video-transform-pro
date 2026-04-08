import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Film, Play, Pause, Rewind, FastForward } from 'lucide-react';

interface VideoPreviewProps {
  videoFile: File | null;
  startTime: number;
  endTime: number;
  format: 'youtube' | 'instagram';
  lutFile: File | null;
  onDurationLoaded?: (duration: number) => void;
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
    uniform sampler3D u_lut;
    uniform bool u_lutOn;
    void main() {
      vec4 c = texture(u_video, v_uv);
      if (u_lutOn) {
        outColor = vec4(texture(u_lut, c.rgb).rgb, c.a);
      } else {
        outColor = c;
      }
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
  gl.uniform1i(gl.getUniformLocation(prog, 'u_video'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_lut'), 1);

  const lutOnLoc = gl.getUniformLocation(prog, 'u_lutOn');
  gl.uniform1i(lutOnLoc, 0);

  let lutTex: WebGLTexture | null = null;

  return {
    setLut(lut: { size: number; data: Uint8Array } | null) {
      if (!lut) {
        gl.uniform1i(lutOnLoc, 0);
        return;
      }
      if (lutTex) gl.deleteTexture(lutTex);
      lutTex = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lutTex);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // RGBA8 + UNSIGNED_BYTE is universally supported in WebGL2
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, lut.size, lut.size, lut.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data);
      gl.uniform1i(lutOnLoc, 1);
      console.log(`LUT loaded: ${lut.size}x${lut.size}x${lut.size}`);
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
      if (lutTex) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, lutTex); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(videoTex);
      if (lutTex) gl.deleteTexture(lutTex);
      gl.deleteProgram(prog);
    },
  };
}

type LutRendererType = ReturnType<typeof createLutRenderer>;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({
  videoFile, startTime, endTime, format, lutFile, onDurationLoaded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LutRendererType>(null);
  const rafRef = useRef(0);
  const aliveRef = useRef(true);

  const [videoUrl, setVideoUrl] = useState('');
  const [lutActive, setLutActive] = useState(false);
  const [splitPos, setSplitPos] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);

  // Mount/unmount
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Video URL
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rendererRef.current?.dispose();
    rendererRef.current = null;
    setLutActive(false);
    setSplitPos(50);
    setPlaying(false);
    setTime(0);
    setDur(0);

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
      setDur(v.duration);
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

  // Parse LUT
  useEffect(() => {
    if (!lutFile) {
      rendererRef.current?.setLut(null);
      setLutActive(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (!aliveRef.current) return;
      const parsed = parseCubeFile(e.target?.result as string);
      if (!parsed) return;

      // Ensure renderer exists
      if (!rendererRef.current && canvasRef.current) {
        rendererRef.current = createLutRenderer(canvasRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.setLut(parsed);
        setLutActive(true);
      }
    };
    reader.readAsText(lutFile);
  }, [lutFile]);

  // Render loop — only when LUT is active and not showing original
  const tick = useCallback(() => {
    if (!aliveRef.current) return;
    const v = videoRef.current;
    const r = rendererRef.current;
    if (v && r && !v.paused && v.readyState >= 2) {
      r.render(v);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (lutActive) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [lutActive, tick]);

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
    if (!v || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  };

  const pct = dur > 0 ? (time / dur) * 100 : 0;

  return (
    <div className="preview-panel fade-up">
      <div className="preview-viewport">
        {videoUrl ? (
          <div className={`preview-frame ${format === 'instagram' ? 'fmt-instagram' : 'fmt-youtube'}`}>
            <video
              ref={videoRef}
              src={videoUrl || undefined}
              muted loop autoPlay playsInline
              style={{ display: 'block', width: '100%', height: '100%' }}
            />
            <canvas
              ref={canvasRef}
              style={{
                display: lutActive ? 'block' : 'none',
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                clipPath: `polygon(0 0, ${splitPos}% 0, ${splitPos}% 100%, 0 100%)`
              }}
            />

            <div className="preview-badge" style={{ zIndex: 20 }}>
              <span className="preview-badge-dot" />
              {lutActive ? 'LUT Applied' : 'Live'}
            </div>

            {lutActive && (
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
          <span className="tl-time">{fmt(time)} / {fmt(dur)}</span>
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
