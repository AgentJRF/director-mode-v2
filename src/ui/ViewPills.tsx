import { S } from '../store';
import { useRev } from './bits';

const GlobeIcon = () => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="9" cy="9" r="6.5" />
    <ellipse cx="9" cy="9" rx="2.8" ry="6.5" />
    <line x1="2.6" y1="9" x2="15.4" y2="9" />
  </svg>
);
const CubeIcon = () => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M9 2.2 L15 5.6 V12.4 L9 15.8 L3 12.4 V5.6 Z" />
    <path d="M9 2.2 V9 M9 9 L15 5.6 M9 9 L3 5.6" />
  </svg>
);

export default function ViewPills() {
  useRev();
  const ui = S().ui;
  const world = ui.gizmoSpace === 'world';
  return (
    <div className="hud" style={{ top: 12, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', display: 'flex', gap: 8 }}>
      <div className="seg" style={{ background: 'rgba(0,0,0,.5)' }}>
        <button className={ui.viewMode === 'camera' && !ui.split ? 'sel' : ''} onClick={() => { S().setSplit(false); S().setViewMode('camera'); }} title="Look through the camera">◉ Camera</button>
        <button className={ui.viewMode === 'scene' && !ui.split ? 'sel' : ''} onClick={() => { S().setSplit(false); S().setViewMode('scene'); }} title="Free editor view: see the camera + animation spline in the scene">⬚ Scene</button>
        <button className={ui.split ? 'sel' : ''} onClick={() => S().setSplit(!ui.split)} title="Split view: Scene editor (left) + live Camera (right)">◫ Split</button>
      </div>
      {ui.viewMode === 'scene' && (
        <div className="seg" style={{ background: 'rgba(0,0,0,.5)' }}>
          <button className={ui.multiview ? 'sel' : ''} onClick={() => S().setMultiview(!ui.multiview)}
            title="Quad view: Perspective + Top + Front + Side (4)">⊞ Quad</button>
        </div>
      )}
      {/* Gizmo space is NOT a view mode → set apart from the view toggles with a gap. */}
      {ui.viewMode === 'scene' && (
        <div className="seg" style={{ background: 'rgba(0,0,0,.5)', marginLeft: 22 }}>
          <button onClick={() => S().setGizmoSpace(world ? 'local' : 'world')}
            title={world ? 'Gizmo orientation: World — click for Object (R)' : 'Gizmo orientation: Object — click for World (R)'}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {world ? <GlobeIcon /> : <CubeIcon />}
            <span>{world ? 'World' : 'Object'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
