import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { S } from '../store';
import { useRev } from './bits';
import { selectLight, addLight, removeLight } from '../lib/lights';
import { lightHideKey } from '../lib/lightRig';
import { IcCamera, IcCube, IcTarget, IcTrash, IcEye, IcFloor } from './icons';
import type { LightKind } from '../types';

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

// Per-kind light glyphs, drawn to match the Substance 3D Stager light-type icons (Adobe reference):
// Area = quad emitter · Spot = cone · Point = ringed dot · Directional = corner rays.
function LightGlyph({ kind }: { kind: LightKind }) {
  const p = { width: 14, height: 14, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'spot': return <svg {...p}><path d="M9 3 L4.6 13 Q9 14.8 13.4 13 Z" /></svg>;
    case 'area': return <svg {...p}><path d="M3.6 6.4 L12 3.4 L14.4 11.6 L6 14.6 Z" /></svg>;
    case 'point': return <svg {...p}><circle cx="9" cy="9" r="5.2" /><circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" /></svg>;
    case 'directional': return <svg {...p}><circle cx="4" cy="4" r="1.2" fill="currentColor" stroke="none" /><path d="M4 8.4 A4.4 4.4 0 0 1 8.4 4" /><path d="M4 11.4 A7.4 7.4 0 0 1 11.4 4" /><path d="M4 14.4 A10.4 10.4 0 0 1 14.4 4" /></svg>;
    case 'hemisphere': return <svg {...p}><path d="M3 13a6 6 0 0 1 12 0" /><line x1="2" y1="13.2" x2="16" y2="13.2" /></svg>;
    case 'env': return <svg {...p}><circle cx="9" cy="9" r="6" /><ellipse cx="9" cy="9" rx="2.7" ry="6" /><line x1="3" y1="9" x2="15" y2="9" /></svg>;
    default: return <svg {...p}><circle cx="9" cy="9" r="3" /></svg>;
  }
}

// Scene objects only — the ground + grid are viewport furniture (not listed here).
const OBJECTS: { id: string; label: string; icon: () => ReactElement }[] = [
  { id: 'product', label: 'Product', icon: () => <IcCube size={14} /> },
  { id: 'pedestal', label: 'Pedestal', icon: () => <IcCube size={14} /> },
];

const Chevron = ({ open }: { open: boolean }) => (
  <svg className={'ol-chev' + (open ? '' : ' closed')} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4 5 6.5 7.5 4" /></svg>
);

// A collapsible outliner group: chevron + title + item count, an optional add control, and a nested
// (left-rail) body — the "layer stack" feel.
function Group({ title, count, open, onToggle, onAdd, addTitle, children }:
  { title: string; count: number; open: boolean; onToggle: () => void; onAdd?: (e: React.MouseEvent) => void; addTitle?: string; children: ReactNode }) {
  return (
    <div className="ol-grp">
      <div className="ol-grp-h" onClick={onToggle}>
        <Chevron open={open} />
        <span className="ol-grp-t">{title}</span>
        <span className="ol-count">{count}</span>
        {onAdd && <span className="ol-add" title={addTitle} onClick={e => { e.stopPropagation(); onAdd(e); }}>+</span>}
      </div>
      {open && <div className="ol-body">{children}</div>}
    </div>
  );
}

export default function Outliner() {
  useRev();
  const st = S(); const proj = st.project; const cam = st.active();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [camMenu, setCamMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [addLightMenu, setAddLightMenu] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState({ cameras: true, lights: true, objects: true });
  const toggle = (k: keyof typeof open) => setOpen(o => ({ ...o, [k]: !o[k] }));

  useEffect(() => {
    if (!menu && !camMenu && !addLightMenu) return;
    const close = () => { setMenu(null); setCamMenu(null); setAddLightMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey); };
  }, [menu, camMenu, addLightMenu]);

  const isTarget = (id: string) => cam.target?.type === 'object' && cam.target.objectId === id;
  const onTargetContext = (e: React.MouseEvent, id: string) => {
    if (!isTarget(id)) return;
    e.preventDefault(); e.stopPropagation();
    st.selectTarget(true);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const LIGHT_KINDS: { kind: LightKind; label: string }[] = [
    { kind: 'spot', label: 'Spot' }, { kind: 'area', label: 'Area' },
    { kind: 'hemisphere', label: 'Dome' }, { kind: 'point', label: 'Point' },
  ];

  return (
    <>
      <div className="insp-h">Scene</div>
      <div className="sect ol">
        <Group title="Cameras" count={proj.cameras.length} open={open.cameras} onToggle={() => toggle('cameras')}
          onAdd={() => st.addCamera()} addTitle="New camera">
          {proj.cameras.length === 0 && <div className="ol-empty">No cameras — click + to add one.</div>}
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
        </Group>

        <Group title="Lights" count={proj.lights.length} open={open.lights} onToggle={() => toggle('lights')}
          onAdd={e => setAddLightMenu({ x: e.clientX, y: e.clientY })} addTitle="Add a light">
          {proj.lights.length === 0 && <div className="ol-empty">No lights — click + to add one.</div>}
          {proj.lights.map(l => {
            const on = l.id === proj.activeLightId && st.ui.inspect === 'light';
            return (
              <div key={l.id} className={'ol-row' + (on ? ' sel' : '')} onClick={() => selectLight(l.id)}>
                <span className="ol-ic" style={{ color: l.color }}><LightGlyph kind={l.kind} /></span>
                <span className="nm">{l.name}</span>
                <span className="ol-eye" title="Delete light" onClick={e => { e.stopPropagation(); removeLight(l.id); }}><IcTrash size={13} /></span>
                <Eye id={lightHideKey(l.id)} />
              </div>
            );
          })}
        </Group>

        <Group title="Objects" count={OBJECTS.length + 1} open={open.objects} onToggle={() => toggle('objects')}>
          {OBJECTS.map(o => (
            <div key={o.id} className="ol-row" onContextMenu={e => onTargetContext(e, o.id)}>
              <span className="ol-ic">{o.icon()}</span>
              <span className="nm">{o.label}</span>
              {isTarget(o.id) && <TargetBadge />}
              <Eye id={o.id} />
            </div>
          ))}
          {/* Backdrop = a visible studio ground so the product/pedestal don't float. Eye toggles it,
              the swatch sets the ground+background colour (they blend for a seamless sweep). */}
          <div className="ol-row">
            <span className="ol-ic" style={{ color: proj.backdrop.enabled ? proj.backdrop.color : undefined }}><IcFloor size={14} /></span>
            <span className="nm">Backdrop</span>
            <input type="color" value={proj.backdrop.color} title="Backdrop colour"
              onClick={e => e.stopPropagation()} onChange={e => st.setBackdrop({ color: e.target.value })}
              style={{ width: 22, height: 16, padding: 0, border: '1px solid var(--line-2)', borderRadius: 3, background: 'none', cursor: 'pointer', marginRight: 2 }} />
            <span className="ol-eye" title={proj.backdrop.enabled ? 'Hide backdrop' : 'Show backdrop'}
              style={{ opacity: proj.backdrop.enabled ? 1 : undefined }}
              onClick={e => { e.stopPropagation(); st.setBackdrop({ enabled: !proj.backdrop.enabled }); }}><IcEye off={!proj.backdrop.enabled} size={14} /></span>
          </div>
        </Group>
      </div>

      {addLightMenu && (
        <div style={{
          position: 'fixed', left: Math.min(addLightMenu.x, window.innerWidth - 168), top: addLightMenu.y, zIndex: 100,
          background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 6,
          boxShadow: '0 8px 30px rgba(0,0,0,.5)', padding: 4, minWidth: 150,
        }} onPointerDown={e => e.stopPropagation()}>
          {LIGHT_KINDS.map(({ kind, label }) => (
            <button key={kind} className="btn-sm btn-full" style={{ border: 'none', justifyContent: 'flex-start', display: 'flex', gap: 8, alignItems: 'center' }}
              onClick={() => { addLight(kind); setAddLightMenu(null); }}>
              <span style={{ display: 'inline-flex', color: 'var(--ink-2)' }}><LightGlyph kind={kind} /></span>{label}
            </button>
          ))}
        </div>
      )}

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
