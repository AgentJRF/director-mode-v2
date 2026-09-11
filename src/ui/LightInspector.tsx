import { S } from '../store';
import { useRev } from './bits';
import { evalLight, lightPoi } from '../lib/lightEval';
import {
  activeLight, lightKeysOf, removeLight, duplicateLight, lightKindLabel,
  setLightColor, setLightGroundColor, setLightAngle, setLightPenumbra, setLightCastShadow,
  setLightWidth, setLightHeight, clearLightTarget, setLightEnvRotation, setLightHdri,
  editLightIntensity, editLightPos, editLightPoi, toggleLightKey,
} from '../lib/lights';
import { round } from '../lib/eval';
import { hdriThumbs } from '../lib/hdriThumb';
import { IcTrash } from './icons';
import type { Channel, Vec3 } from '../types';

function KeyDot({ ch, value }: { ch: Channel; value: Vec3 | number }) {
  const l = activeLight(); if (!l) return null;
  const t = S().project.timeline.playhead;
  const ks = lightKeysOf(l, ch);
  const at = ks.some(k => Math.abs(k.time - t) < 0.02);
  const cls = 'kf' + (at ? ' on' : ks.length ? ' anim' : '');
  return <button type="button" className={cls} title={at ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
    onClick={e => { e.stopPropagation(); toggleLightKey(ch, value); }}>{at || ks.length ? '◆' : '◇'}</button>;
}

function Vec3Row({ label, ch, value, step = 0.1, disabled, onChange }:
  { label: string; ch: Channel; value: number[]; step?: number; disabled?: boolean; onChange: (i: number, v: number) => void }) {
  return (
    <div className={'row vec-row' + (disabled ? ' locked' : '')}>
      <span className="row-lead">{disabled ? <span className="kf-spacer" /> : <KeyDot ch={ch} value={value as Vec3} />}<label>{label}</label></span>
      <div className="vec3">{['X', 'Y', 'Z'].map((lb, i) => (
        <input key={lb} type="number" step={step} value={round(value[i], 2)} disabled={disabled}
          onChange={e => onChange(i, parseFloat(e.target.value) || 0)} />
      ))}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, ch, onChange }:
  { label: string; value: number; min: number; max: number; step: number; unit?: string; ch?: Channel; onChange: (v: number) => void }) {
  return (
    <div className="row">
      <span className="row-lead">{ch ? <KeyDot ch={ch} value={value} /> : <span className="kf-spacer" />}<label>{label}</label></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
        <span className="val-box"><span className="val">{round(value, step < 1 ? 1 : 0)}{unit || ''}</span></span>
      </div>
    </div>
  );
}

export default function LightInspector() {
  useRev();
  const l = activeLight();
  if (!l) return null;
  const st = S(); const t = st.project.timeline.playhead;
  const pose = evalLight(l, t);
  const isSpot = l.kind === 'spot';
  const isDir = l.kind === 'directional';
  const isArea = l.kind === 'area';
  const positional = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'point' || l.kind === 'area';
  const aims = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'area';

  return (
    <>
      <div className="sect">
        <div className="sect-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{l.name}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn-sm" title="Duplicate" onClick={() => duplicateLight(l.id)}>⧉</button>
            <button className="btn-sm danger" title="Delete" onClick={() => removeLight(l.id)}>🗑</button>
          </span>
        </div>
        <div className="row"><span className="row-lead"><span className="kf-spacer" /><label>Type</label></span><span className="val">{lightKindLabel(l.kind)}</span></div>
      </div>

      {l.kind === 'env' && (
        <div className="sect">
          <div className="sect-t">Environment light</div>
          <div className="row">
            <span className="row-lead"><span className="kf-spacer" /><label>Image</label></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Click the thumbnail itself to load / replace the HDRI — no separate button. */}
              <label className="hdri-pick" title={l.hdri ? `${l.hdriName || l.hdri} — click to replace` : 'Click to load a .hdr / .exr environment'}>
                {l.hdri && hdriThumbs.get(l.hdri)
                  ? <img src={hdriThumbs.get(l.hdri)} alt={l.hdriName || ''} style={{ width: 72, height: 36, objectFit: 'cover', display: 'block' }} />
                  : <span className="hdri-empty">{l.hdri ? '…' : 'Load'}</span>}
                <span className="hdri-ovl">{l.hdri ? 'Replace' : 'Load'}</span>
                <input type="file" accept=".hdr,.exr,image/x-exr,image/vnd.radiance" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setLightHdri(URL.createObjectURL(f), f.name); e.target.value = ''; }} />
              </label>
              {l.hdri && <button className="btn-sm danger" title="Remove HDRI" style={{ display: 'inline-flex', alignItems: 'center' }} onClick={() => setLightHdri(undefined)}><IcTrash size={13} /></button>}
            </span>
          </div>
          {/* Stager shows intensity as a percentage; 100% = environmentIntensity 1.0. */}
          <Slider label="Intensity" value={Math.round(l.intensity * 100)} min={0} max={400} step={1} unit="%" onChange={pct => editLightIntensity(pct / 100)} />
          <Slider label="Rotation" value={Math.round(l.envRotation ?? 0)} min={0} max={360} step={1} unit="°" onChange={setLightEnvRotation} />
        </div>
      )}

      {l.kind !== 'env' && (<>
      <div className="sect">
        <div className="sect-t">Light</div>
        <div className="row">
          <span className="row-lead"><span className="kf-spacer" /><label>{l.kind === 'hemisphere' ? 'Sky' : 'Color'}</label></span>
          <input type="color" value={l.color} onChange={e => setLightColor(e.target.value)}
            style={{ width: 34, height: 22, padding: 0, border: '1px solid var(--line-2)', borderRadius: 4, background: 'none', cursor: 'pointer' }} />
        </div>
        {l.kind === 'hemisphere' && (
          <div className="row">
            <span className="row-lead"><span className="kf-spacer" /><label>Ground</label></span>
            <input type="color" value={l.groundColor || '#000000'} onChange={e => setLightGroundColor(e.target.value)}
              style={{ width: 34, height: 22, padding: 0, border: '1px solid var(--line-2)', borderRadius: 4, background: 'none', cursor: 'pointer' }} />
          </div>
        )}
        <Slider label="Intensity" ch="intensity" value={pose.intensity} min={0} max={isSpot || isArea ? 20 : 4} step={0.1} onChange={editLightIntensity} />
        {isSpot && <Slider label="Cone" value={Math.round((l.angle ?? 0.6) * 180 / Math.PI)} min={5} max={89} step={1} unit="°"
          onChange={deg => setLightAngle(deg * Math.PI / 180)} />}
        {isSpot && <Slider label="Softness" value={l.penumbra ?? 0.5} min={0} max={1} step={0.05} onChange={setLightPenumbra} />}
        {isArea && <Slider label="Width" value={l.width ?? 4} min={0.1} max={20} step={0.1} onChange={setLightWidth} />}
        {isArea && <Slider label="Height" value={l.height ?? 2} min={0.1} max={20} step={0.1} onChange={setLightHeight} />}
        {(isSpot || isDir) && (
          <div className="row">
            <span className="row-lead"><span className="kf-spacer" /><label>Shadow</label></span>
            <button className={'btn-sm' + (l.castShadow ? ' amber' : '')} onClick={() => setLightCastShadow(!l.castShadow)}>{l.castShadow ? 'On' : 'Off'}</button>
          </div>
        )}
      </div>

      {positional && (
        <div className="sect">
          <div className="sect-t">Transform</div>
          <Vec3Row label="Position" ch="position" value={pose.position} onChange={editLightPos} />
          {aims && <Vec3Row label="Aim (POI)" ch="poi" value={lightPoi(l, t)} disabled={l.target?.type === 'object'} onChange={editLightPoi} />}
          {l.target?.type === 'object' && (
            <div className="row">
              <span className="row-lead"><span className="kf-spacer" /><label>⚿ Locked to {l.target.objectId}</label></span>
              <button className="btn-sm" title="Unlock aim from the target object" onClick={() => clearLightTarget()}>Unlock</button>
            </div>
          )}
        </div>
      )}
      </>)}
    </>
  );
}