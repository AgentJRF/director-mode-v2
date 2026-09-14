import { useState } from 'react';
import { useRev } from './bits';
import { GOBO_PATTERNS, goboThumb } from '../lib/gobo';
import { applyGobo, applyGoboCustom, resolveGoboSpot } from '../lib/lights';
import type { GoboPattern } from '../types';

// A gobo preview styled like the lighting-preset cards: the pattern shown PROJECTED on a lit gray
// sphere (the mask is multiplied over the sphere), so you read the actual result — not a raw mask.
function GoboSpherePreview({ src }: { src: string }) {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#17181c', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '64%', aspectRatio: '1 / 1', borderRadius: '50%',
        background: 'radial-gradient(circle at 34% 30%, #eceef0, #b7bac0 42%, #6d7075 74%, #33353a 100%)',
      }}>
        {src && <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', mixBlendMode: 'multiply' }} />}
      </div>
      <div style={{ position: 'absolute', left: '50%', bottom: '7%', transform: 'translateX(-50%)', width: '66%', height: 6, background: '#000', opacity: 0.35, borderRadius: '50%', filter: 'blur(2px)' }} />
    </div>
  );
}

// Gobo gallery, presented like the lighting presets: click a card to select it, then Apply. Applies to
// the selected spot (else the Key). "None" clears it; "Custom" uploads an image.
export default function GobosPanel() {
  useRev();
  const spot = resolveGoboSpot();
  const current: GoboPattern | 'none' = spot?.gobo?.enabled ? spot.gobo.pattern : 'none';
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState<GoboPattern | 'none'>(current);

  const cardStyle = (active: boolean): React.CSSProperties => ({
    padding: 5, cursor: 'pointer', background: 'var(--panel-2)', borderRadius: 8,
    border: `${active ? 2 : 1}px solid ${active ? 'var(--blue)' : 'var(--line-2)'}`,
  });
  const footer = (label: string, showApply: boolean, onApply: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-1)' }}>{label}</span>
      {showApply && <button className="btn-sm" style={{ padding: '1px 9px', fontSize: 11, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 5 }}
        onClick={e => { e.stopPropagation(); onApply(); }}>Apply</button>}
    </div>
  );

  return (
    <div className="sect">
      <div className="sect-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .12s' }}>
          <path d="M2.5 4 5 6.5 7.5 4" /></svg>
        Gobos
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--ink-3)' }}>{spot ? `→ ${spot.name}` : 'no spot'}</span>
      </div>

      {open && (<>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
          {/* None */}
          <div className="gobo-card" onClick={() => setSel('none')} style={cardStyle(sel === 'none')}>
            <GoboSpherePreview src="" />
            {footer('None', sel === 'none', () => applyGobo(null))}
          </div>
          {/* Procedural + image patterns */}
          {GOBO_PATTERNS.filter(p => p.id !== 'custom').map(p => (
            <div key={p.id} className="gobo-card" onClick={() => setSel(p.id)} style={cardStyle(sel === p.id)}>
              <GoboSpherePreview src={goboThumb(p.id)} />
              {footer(p.label, sel === p.id, () => applyGobo(p.id))}
            </div>
          ))}
          {/* Custom = upload (applies immediately) */}
          <label className="gobo-card" title="Load a custom gobo image (PNG/JPG)" style={{ ...cardStyle(current === 'custom'), display: 'block' }}>
            <GoboSpherePreview src={spot?.gobo?.pattern === 'custom' ? (spot.gobo.customUrl || '') : ''} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-1)' }}>Custom</span>
              <span style={{ fontSize: 11, color: 'var(--blue)' }}>Load…</span>
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { applyGoboCustom(URL.createObjectURL(f), f.name); setSel('custom'); } e.target.value = ''; }} />
          </label>
        </div>
        {!spot && <div className="hint" style={{ margin: '6px 0 0' }}>Add a Spot light (or apply the Three-point preset) to project a gobo.</div>}
      </>)}
    </div>
  );
}
