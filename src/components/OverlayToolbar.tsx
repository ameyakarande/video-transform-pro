import {
  AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, Copy,
  Clock3, Italic, SendToBack, Trash2, Underline,
} from 'lucide-react';
import type { OverlayItem } from '../types/editor';

interface OverlayToolbarProps {
  overlay: OverlayItem;
  onChange: (patch: Partial<OverlayItem>) => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDelete: () => void;
}

const fonts = ['Inter', 'Arial', 'Georgia', 'Impact', 'Courier New'];

export default function OverlayToolbar({
  overlay, onChange, onDuplicate, onBringForward, onSendBackward, onDelete,
}: OverlayToolbarProps) {
  return (
    <div className="overlay-toolbar" role="toolbar" aria-label={`${overlay.type} controls`}>
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
          <select
            className="toolbar-select toolbar-font"
            value={overlay.fontFamily || 'Inter'}
            onChange={(event) => onChange({ fontFamily: event.target.value })}
            aria-label="Font family"
          >
            {fonts.map((font) => <option key={font}>{font}</option>)}
          </select>
          <div className="toolbar-stepper">
            <button onClick={() => onChange({ fontSize: Math.max(12, (overlay.fontSize || 48) - 2) })}>−</button>
            <input
              type="number"
              min="12"
              max="240"
              value={overlay.fontSize || 48}
              onChange={(event) => onChange({ fontSize: Math.max(12, Number(event.target.value) || 12) })}
              aria-label="Font size"
            />
            <button onClick={() => onChange({ fontSize: Math.min(240, (overlay.fontSize || 48) + 2) })}>+</button>
          </div>
          <label className="toolbar-color" title="Text color">
            <span style={{ background: overlay.color || '#ffffff' }} />
            <input type="color" value={overlay.color || '#ffffff'} onChange={(event) => onChange({ color: event.target.value })} />
          </label>
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

      <label className="toolbar-range" title="Opacity">
        <span>Opacity</span>
        <input type="range" min="10" max="100" value={Math.round((overlay.opacity ?? 1) * 100)} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} />
      </label>
      <div className="toolbar-spacer" />
      <button onClick={onSendBackward} title="Send backward"><SendToBack /></button>
      <button onClick={onBringForward} title="Bring forward"><BringToFront /></button>
      <button onClick={onDuplicate} title="Duplicate"><Copy /></button>
      <button className="danger" onClick={onDelete} title="Delete"><Trash2 /></button>
    </div>
  );
}
