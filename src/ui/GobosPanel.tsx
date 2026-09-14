import { useState } from 'react';
import { useRev } from './bits';
import { S } from '../store';
import { GOBO_PATTERNS, goboThumb } from '../lib/gobo';
import { applyGobo, applyGoboCustom, resolveGoboSpot } from '../lib/lights';

// A gobo gallery (like the lighting presets): click a pattern thumbnail to project it through a spot.
// Applies to the selected spot, else the Key. "None" removes it; "Custom" uploads an image.
export default function GobosPanel() {
  useRev();
  const spot = resolveGoboSpot();
  const current = spot?.gobo?.enabled ? spot.gobo.pattern : null;
  const [open, setOpen] = useState(true);

  const card = (active: boolean, onClick: () => void, thumb: string, label: string, key: string, upload?: boolean) => {
    const inner = (
      <>
        <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 6, overflow: 'hidden', background: '#17181c',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {thumb ? <img src={thumb} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 18, color: 'var(--ink-3)' }}>{upload ? '＋' : '∅'}</span>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, marginTop: 4, color: 'var(--ink-1)', textAlign: 'center', lineHeight: 1.1 }}>{label}</div>
      </>
    );
    const style: React.CSSProperties = {
      padding: 5, cursor: 'pointer', background: 'var(--panel-2)', borderRadius: 8,
      border: `${active ? 2 : 1}px solid ${active ? 'var(--blue)' : 'var(--line-2)'}`,
    };
    if (upload) return (
      <label key={key} className="gobo-card" title="Load a custom gobo image (PNG/JPG)" style={{ ...style, display: 'block' }}>
        {inner}
        <input type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) applyGoboCustom(URL.createObjectURL(f), f.name); e.target.value = ''; }} />
      </label>
    );
    return <div key={key} className="gobo-card" onClick={onClick} style={style}>{inner}</div>;
  };

  return (
    <div className="sect">
      <div className="sect-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .12s' }}>
          <path d="M2.5 4 5 6.5 7.5 4" /></svg>
        Gobos
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--ink-3)' }}>
          {spot ? `→ ${spot.name}` : 'no spot'}
        </span>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
          {card(current === null, () => applyGobo(null), '', 'None', 'none')}
          {GOBO_PATTERNS.filter(p => p.id !== 'custom').map(p =>
            card(current === p.id, () => applyGobo(p.id), goboThumb(p.id), p.label, p.id))}
          {card(current === 'custom', () => {}, spot?.gobo?.customUrl && current === 'custom' ? spot.gobo.customUrl : '', 'Custom', 'custom', true)}
        </div>
      )}
      {!spot && <div className="hint" style={{ margin: '6px 0 0' }}>Add a Spot light (or apply the Three-point preset) to project a gobo.</div>}
    </div>
  );
}
