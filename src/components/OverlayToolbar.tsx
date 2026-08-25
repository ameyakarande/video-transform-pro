import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, Clock3, Copy,
  Crop, FlipHorizontal2, FlipVertical2, GripHorizontal, Italic, RotateCw,
  SendToBack, SlidersHorizontal, Trash2, Underline, Volume2, VolumeX, X,
} from 'lucide-react';
import type { OverlayItem } from '../types/editor';

interface OverlayToolbarProps {
  overlay: OverlayItem;
  onChange: (patch: Partial<OverlayItem>) => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const fonts = ['Inter', 'Arial', 'Georgia', 'Impact', 'Courier New'];

function AdjustSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="media-adjust-row"><span>{label}</span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}</output></label>;
}

export default function OverlayToolbar({
  overlay, onChange, onDuplicate, onBringForward, onSendBackward, onDelete, onClose,
}: OverlayToolbarProps) {
  const [position, setPosition] = useState({ x: 24, y: 92 });
  const [mediaEditorOpen, setMediaEditorOpen] = useState(false);
  const dragRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const nextX = dragRef.current.startX + event.clientX - dragRef.current.pointerX;
      const nextY = dragRef.current.startY + event.clientY - dragRef.current.pointerY;
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - 260, nextX)),
        y: Math.max(8, Math.min(window.innerHeight - 58, nextY)),
      });
    };
    const stop = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, []);

  return (
    <div className="overlay-toolbar" style={{ left: position.x, top: position.y }} role="toolbar" aria-label={`${overlay.type} controls`}>
      <button
        className="toolbar-drag-handle"
        onPointerDown={(event) => {
          event.preventDefault();
          dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, startX: position.x, startY: position.y };
        }}
        title="Move toolbar"
      ><GripHorizontal /></button>

      <div className="toolbar-scroll">
        <label className="toolbar-time" title="Element timing">
          <Clock3 />
          <input type="number" min="0" step="0.1" value={Number(overlay.startTime.toFixed(1))} onChange={(event) => onChange({ startTime: Math.max(0, Number(event.target.value)) })} aria-label="Start time" />
          <span>–</span>
          <input type="number" min={overlay.startTime + 0.1} step="0.1" value={Number(overlay.endTime.toFixed(1))} onChange={(event) => onChange({ endTime: Math.max(overlay.startTime + 0.1, Number(event.target.value)) })} aria-label="End time" />
          <span>s</span>
        </label>
        <span className="overlay-toolbar-kind">{overlay.type}</span>

        {overlay.type === 'text' && (
          <>
            <select className="toolbar-select toolbar-font" value={overlay.fontFamily || 'Inter'} onChange={(event) => onChange({ fontFamily: event.target.value })} aria-label="Font family">
              {fonts.map((font) => <option key={font}>{font}</option>)}
            </select>
            <div className="toolbar-stepper">
              <button onClick={() => onChange({ fontSize: Math.max(12, (overlay.fontSize || 48) - 2) })}>−</button>
              <input type="number" min="12" max="240" value={overlay.fontSize || 48} onChange={(event) => onChange({ fontSize: Math.max(12, Number(event.target.value) || 12) })} aria-label="Font size" />
              <button onClick={() => onChange({ fontSize: Math.min(240, (overlay.fontSize || 48) + 2) })}>+</button>
            </div>
            <label className="toolbar-color" title="Text color"><span style={{ background: overlay.color || '#ffffff' }} /><input type="color" value={overlay.color || '#ffffff'} onChange={(event) => onChange({ color: event.target.value })} /></label>
            <button className={overlay.fontWeight === 'bold' ? 'active' : ''} onClick={() => onChange({ fontWeight: overlay.fontWeight === 'bold' ? 'normal' : 'bold' })} title="Bold"><Bold /></button>
            <button className={overlay.fontStyle === 'italic' ? 'active' : ''} onClick={() => onChange({ fontStyle: overlay.fontStyle === 'italic' ? 'normal' : 'italic' })} title="Italic"><Italic /></button>
            <button className={overlay.textDecoration === 'underline' ? 'active' : ''} onClick={() => onChange({ textDecoration: overlay.textDecoration === 'underline' ? 'none' : 'underline' })} title="Underline"><Underline /></button>
            <div className="toolbar-group">
              <button className={overlay.textAlign === 'left' ? 'active' : ''} onClick={() => onChange({ textAlign: 'left' })} title="Align left"><AlignLeft /></button>
              <button className={(overlay.textAlign || 'center') === 'center' ? 'active' : ''} onClick={() => onChange({ textAlign: 'center' })} title="Align center"><AlignCenter /></button>
              <button className={overlay.textAlign === 'right' ? 'active' : ''} onClick={() => onChange({ textAlign: 'right' })} title="Align right"><AlignRight /></button>
            </div>
          </>
        )}

        {overlay.type !== 'text' && (
          <>
            <button className={mediaEditorOpen ? 'active' : ''} onClick={() => setMediaEditorOpen((open) => !open)} title="Edit media"><SlidersHorizontal /></button>
            <button className={overlay.fit === 'cover' ? 'active' : ''} onClick={() => onChange({ fit: overlay.fit === 'cover' ? 'contain' : 'cover' })} title={overlay.fit === 'cover' ? 'Show entire media' : 'Crop to fill'}><Crop /></button>
            <button className={overlay.flipX ? 'active' : ''} onClick={() => onChange({ flipX: !overlay.flipX })} title="Flip horizontally"><FlipHorizontal2 /></button>
            <button className={overlay.flipY ? 'active' : ''} onClick={() => onChange({ flipY: !overlay.flipY })} title="Flip vertically"><FlipVertical2 /></button>
            <button onClick={() => onChange({ rotation: ((overlay.rotation || 0) + 90) % 360 })} title="Rotate 90 degrees"><RotateCw /></button>
            {overlay.type === 'video' && <button className={overlay.muted !== false ? 'active' : ''} onClick={() => onChange({ muted: overlay.muted === false })} title={overlay.muted === false ? 'Mute clip' : 'Unmute clip'}>{overlay.muted === false ? <Volume2 /> : <VolumeX />}</button>}
          </>
        )}

        <label className="toolbar-range" title="Opacity"><span>Opacity</span><input type="range" min="10" max="100" value={Math.round((overlay.opacity ?? 1) * 100)} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} /></label>
        <button onClick={onSendBackward} title="Send backward"><SendToBack /></button>
        <button onClick={onBringForward} title="Bring forward"><BringToFront /></button>
        <button onClick={onDuplicate} title="Duplicate"><Copy /></button>
        <button className="danger" onClick={onDelete} title="Delete"><Trash2 /></button>
      </div>
      <button className="toolbar-close" onClick={onClose} title="Close formatter"><X /></button>

      {mediaEditorOpen && overlay.type !== 'text' && (
        <div className="media-editor-popover">
          <div className="media-editor-heading"><strong>Edit {overlay.type}</strong><button onClick={() => setMediaEditorOpen(false)}><X /></button></div>
          <div className="media-preset-row">
            <button onClick={() => onChange({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: 0, sepia: 0, hueRotate: 0 })}>Original</button>
            <button onClick={() => onChange({ contrast: 12, saturation: 18, brightness: 3, sepia: 0, grayscale: 0 })}>Vivid</button>
            <button onClick={() => onChange({ grayscale: 100, contrast: 12, saturation: -100, sepia: 0 })}>Mono</button>
            <button onClick={() => onChange({ sepia: 38, saturation: -12, brightness: 5, grayscale: 0 })}>Warm</button>
          </div>
          <AdjustSlider label="Brightness" value={overlay.brightness || 0} min={-100} max={100} onChange={(value) => onChange({ brightness: value })} />
          <AdjustSlider label="Contrast" value={overlay.contrast || 0} min={-100} max={100} onChange={(value) => onChange({ contrast: value })} />
          <AdjustSlider label="Saturation" value={overlay.saturation || 0} min={-100} max={100} onChange={(value) => onChange({ saturation: value })} />
          <AdjustSlider label="Blur" value={overlay.blur || 0} min={0} max={20} onChange={(value) => onChange({ blur: value })} />
          <AdjustSlider label="Grayscale" value={overlay.grayscale || 0} min={0} max={100} onChange={(value) => onChange({ grayscale: value })} />
          <AdjustSlider label="Sepia" value={overlay.sepia || 0} min={0} max={100} onChange={(value) => onChange({ sepia: value })} />
          <AdjustSlider label="Hue" value={overlay.hueRotate || 0} min={-180} max={180} onChange={(value) => onChange({ hueRotate: value })} />
          <AdjustSlider label="Corners" value={overlay.borderRadius || 0} min={0} max={80} onChange={(value) => onChange({ borderRadius: value })} />
          {overlay.type === 'video' && <AdjustSlider label="Speed ×10" value={Math.round((overlay.playbackRate || 1) * 10)} min={5} max={20} onChange={(value) => onChange({ playbackRate: value / 10 })} />}
        </div>
      )}
    </div>
  );
}
