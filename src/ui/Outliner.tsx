import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { S } from '../store';
import { useRev } from './bits';
import { selectLight, addLight, removeLight } from '../lib/lights';
import { lightHideKey } from '../lib/lightRig';
import { IcCamera, IcCube, IcTarget, IcTrash, IcEye } from './icons';

function Eye({ id }: { id: string }) {
  const off = !!S().ui.hidden[id];
  return (
    <span className="ol-eye" title={off ? 'Show' : 'Hide'} style={{ opacity: off ? 1 : undefined, color: off ? 'var(--ink-3)' : undefined }}
      onClick={e => { e.stopPropagation(); S().toggleHidden(id); }}><IcEye off={off} size={14} /></span>
  );
}

// Target badge shown next to the object the ACTIVE camera aims at. Click to select (Del removes),
// right-click for a "Remove target" menu.
function TargetBadge() {
  const st = S(); const sel = st.ui.targetSelected;
  return (
    <span className="ol-target" title={sel ? 'Target selected — Del to remove' : 'Active camera target (click to select, right-click to remove)'}
      onClick={e => { e.stopPropagation(); st.selectTarget(!sel); }}
      style={{ display: 'inline-flex', marginLeft: 'auto', marginRight: 4, cursor: 'pointer', color: sel ? 'var(--amber)' : 'var(--blue)' }}>
      <IcTarget size={13} />
    </span>
  );
}

const Bulb = () => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2.5a4.2 4.2 0 0 0-2.4 7.6c.5.4.8.9.8 1.5h3.2c0-.6.3-1.1.8-1.5A4.2 4.2 0 0 0 9 2.5Z" /><path d="M7.4 13.4h3.2M7.8 15h2.4" />
  </svg>
);

// Scene objects only — the ground + grid are viewport furniture (not listed here).
const OBJECTS: { id: string; label: string; icon: () => ReactElement }[] = [
  { id: 'product', label: 'Product', icon: () => <IcCube size={14} /> },
  { id: 'pedestal', label: 'Pedestal', icon: () => <IcCube size={14} /> },
];

export default function Outliner() {
  useRev();
  const st = S(); const proj = st.project; const cam = st.active();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [camMenu, setCamMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu && !camMenu) return;
    const close = () => { setMenu(null); setCamMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey); };
  }, [menu, camMenu]);

  const isTarget = (id: string) => cam.target?.type === 'object' && cam.target.objectId === id;
  const onTargetContext = (e: React.MouseEvent, id: string) => {
    if (!isTarget(id)) return;
    e.preventDefault(); e.stopPropagation();
    st.selectTarget(true);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div className="insp-h">Scene</div>
      <div className="sect">
        <div className="sect-t">Cameras</div>
        {proj.cameras.map(c => {
          const active = c.id === proj.activeCameraId;
          return (
            <div key={c.id} className={'ol-row' + (active ? ' sel' : '')} onClick={() => st.selectCamera(c.id)}
              onContextMenu={e => { e.preventDefault(); st.selectCamera(c.id); setCamMenu({ id: c.id, x: e.clientX, y: e.clientY }); }}>
              <span className="ol-ic" style={{ color: c.color }}><IcCamera size={14} /></span>
              <span className="nm">{c.name}</span>
              {active && <span className={'ol-dot' + (st.ui.viewMode === 'scene' ? ' scene' : '')}
                title={st.ui.viewMode === 'camera' ? 'Camera POV — click for Scene view' : 'Scene view — click for Camera POV'}
                onClick={e => { e.stopPropagation(); st.setViewMode(st.ui.viewMode === 'camera' ? 'scene' : 'camera'); }} />}
              <span className="ol-eye" title="Delete camera"
                onClick={e => { e.stopPropagation(); st.removeCamera(c.id); }}><IcTrash size={13} /></span>
              <Eye id={'cam:' + c.id} />
            </div>
          );
        })}
        <button className="btn-sm btn-full" style={{ marginTop: 6 }} onClick={() => st.addCamera()}>+ New camera</button>

        <div className="sect-t" style={{ marginTop: 12 }}>Lights</div>
        {proj.lights.map(l => {
          const on = l.id === proj.activeLightId && st.ui.inspect === 'light';
          return (
            <div key={l.id} className={'ol-row' + (on ? ' sel' : '')} onClick={() => selectLight(l.id)}>
              <span className="ol-ic" style={{ color: l.color }}><Bulb /></span>
              <span className="nm">{l.name}</span>
              <span className="ol-eye" title="Delete light" onClick={e => { e.stopPropagation(); removeLight(l.id); }}><IcTrash size={13} /></span>
              <Eye id={lightHideKey(l.id)} />
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
          <button className="btn-sm" title="Add an area (rectangle) light" onClick={() => addLight('area')}>+ Area</button>
          <button className="btn-sm" title="Add a spot light" onClick={() => addLight('spot')}>+ Spot</button>
          <button className="btn-sm" title="Add a dome (hemisphere) light" onClick={() => addLight('hemisphere')}>+ Dome</button>
          <button className="btn-sm" title="Add a point light" onClick={() => addLight('point')}>+ Point</button>
        </div>

        <div className="sect-t" style={{ marginTop: 12 }}>Objects</div>
        {OBJECTS.map(o => (
          <div key={o.id} className="ol-row" onContextMenu={e => onTargetContext(e, o.id)}>
            <span className="ol-ic">{o.icon()}</span>
            <span className="nm">{o.label}</span>
            {isTarget(o.id) && <TargetBadge />}
            <Eye id={o.id} />
          </div>
        ))}
      </div>

      {menu && (
        <div style={{
          position: 'fixed', left: menu.x, top: menu.y, zIndex: 100,
          background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 6,
          boxShadow: '0 8px 30px rgba(0,0,0,.5)', padding: 4, minWidth: 150,
        }} onPointerDown={e => e.stopPropagation()}>
          <button className="btn-sm btn-full" style={{ border: 'none', justifyContent: 'flex-start' }}
            onClick={() => { st.setTarget(null); setMenu(null); }}>Remove target</button>
        </div>
      )}

      {camMenu && (
        <div style={{
          position: 'fixed', left: camMenu.x, top: camMenu.y, zIndex: 100,
          background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 6,
          boxShadow: '0 8px 30px rgba(0,0,0,.5)', padding: 4, minWidth: 160,
        }} onPointerDown={e => e.stopPropagation()}>
          <button className="btn-sm btn-full" style={{ border: 'none', justifyContent: 'flex-start' }}
            onClick={() => { st.duplicateCamera(camMenu.id); setCamMenu(null); }}>Duplicate camera</button>
          <button className="btn-sm btn-full danger" style={{ border: 'none', justifyContent: 'flex-start' }}
            onClick={() => { st.removeCamera(camMenu.id); setCamMenu(null); }}>Delete camera</button>
        </div>
      )}
    </>
  );
}
