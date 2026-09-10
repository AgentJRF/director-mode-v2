import { S, hasAnim } from '../store';
import { useRev } from './bits';
import { evaluate } from '../lib/eval';

export default function HUD() {
  useRev();
  const st = S(); const cam = st.renderCamera(); const tl = st.project.timeline; // on-air camera while playing (cuts)
  const hasCam = st.project.cameras.length > 0;
  const p = evaluate(cam, tl.playhead);
  const rec = st.ui.recording;
  const badgeCls = rec ? 'shot-badge rec' : hasAnim(cam) ? 'shot-badge anim' : 'shot-badge';
  const badgeTxt = rec ? 'REC' : hasAnim(cam) ? 'Anim' : 'Shot';
  const g = Math.round; const gg = (a: number, b: number): number => (b ? gg(b, a % b) : a);
  const d = gg(st.project.canvas.width, st.project.canvas.height);
  const interp = st.ui.interp;
  return (
    <>
      {interp && (
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
          background: 'rgba(18,22,26,.94)', border: '1px solid var(--amber-dim)', borderRadius: 8, padding: '6px 10px 6px 12px',
          display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, boxShadow: '0 6px 24px rgba(0,0,0,.5)' }}>
          <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Interpolate A → B</span>
          <span style={{ color: 'var(--ink-2)' }}>{interp.a ? 'Click camera B in the scene' : 'Click camera A in the scene'}</span>
          <button className="btn-sm" onClick={() => S().cancelInterp()}>Cancel (Esc)</button>
        </div>
      )}
      {hasCam && <div className="hud tl"><div className={badgeCls}><span className="led" /><span>{badgeTxt}</span></div></div>}
      {hasCam && (
        <div className="hud tr">
          <div className="hud-optics">{g(p.focalLength)}&nbsp;mm · f/{p.aperture.toFixed(1)}</div>
          <div className="hud-sub">shutter {g(p.motionBlur)}° · {cam.name}</div>
        </div>
      )}
      <div className="hud bl">
        <span className="ratio-pill" onClick={() => S().setModal('export')}>
          {st.project.canvas.width / d}:{st.project.canvas.height / d} · {st.project.canvas.width}×{st.project.canvas.height} ⚙
        </span>
      </div>
      <div className="hud br">{tl.playhead.toFixed(2)}s / {tl.duration.toFixed(2)}s</div>
    </>
  );
}
