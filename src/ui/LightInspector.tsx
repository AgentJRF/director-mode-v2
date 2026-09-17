import { S } from '../store';
import { useRev, NumInput, EaseCurve } from './bits';
import { evalLight, lightPoi } from '../lib/lightEval';
import {
  activeLight, lightKeysOf, removeLight, duplicateLight, lightKindLabel,
  setLightColor, setLightGroundColor, setLightAngle, setLightPenumbra,
  setLightWidth, setLightHeight, clearLightTarget, setLightEnvRotation, setLightHdri, setLightColorize,
  editLightIntensity, editLightPos, editLightPoi, toggleLightKey, setLightGobo, setLightKeysEase,
} from '../lib/lights';
import { round, EASE_LIST } from '../lib/eval';
import { hdriThumbs } from '../lib/hdriThumb';
import { GOBO_PATTERNS } from '../lib/gobo';
import { IcTrash } from './icons';
import type { Channel, Vec3, GoboPattern, Light } from '../types';

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
        <span className="val-box">
          <NumInput value={value} min={min} max={max} step={step} dec={step < 0.1 ? 2 : step < 1 ? 1 : 0} onChange={onChange} />
          {unit && <span className="val-fix">{unit}</span>}
        </span>
      </div>
    </div>
  );
}

// Speed-curve presets for the light's position move (same eases as the camera). Shown once the light
// has an actual move (≥2 position keys). Applies the ease to every segment of the move.
function LightSpeedCurve({ l }: { l: Light }) {
  const seg = lightKeysOf(l, 'position').slice(1); // each non-first position key ends a segment (its ease)
  if (seg.length === 0) return null;
  const ids = seg.map(k => k.id);
  const eases = new Set(seg.map(k => k.ease));
  const common = eases.size === 1 ? seg[0].ease : null;
  return (
    <div className="sect" style={{ background: 'var(--panel-2)' }}>
      <div className="sect-t">Speed curve{common === null && <span className="st"> mixed</span>}</div>
      <div className="ease-grid">
        {EASE_LIST.map(ez => <div key={ez} className={'ease-opt' + (common === ez ? ' sel' : '')} onClick={() => setLightKeysEase(ids, ez)}>{ez}</div>)}
      </div>
      <EaseCurve ease={common ?? seg[0].ease} />
      <p className="hint" style={{ marginTop: 6 }}>Applies to the whole light move.</p>
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
  const isArea = l.kind === 'area';
  const positional = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'point' || l.kind === 'area';
  const aims = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'area';

  return (
    <>
      {/* env is a single scene-wide IBL — its name/type/duplicate/delete header is redundant
          (delete it from the outliner). Other lights keep the header. */}
      {l.kind !== 'env' && (
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
      )}

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
          <div className="row">
            <span className="row-lead"><span className="kf-spacer" /><label>Colorize</label></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!l.colorize} onChange={e => setLightColorize(e.target.checked)} title="Tint the environment by a colour" />
              <input type="color" value={l.color} disabled={!l.colorize} onChange={e => setLightColor(e.target.value)}
                style={{ width: 34, height: 22, padding: 0, border: '1px solid var(--line-2)', borderRadius: 4, background: 'none', cursor: l.colorize ? 'pointer' : 'not-allowed', opacity: l.colorize ? 1 : 0.4 }} />
            </span>
          </div>
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
        {/* Range centred on the 3×3 default so the handle sits mid-track. */}
        {isArea && <Slider label="Width" value={l.width ?? 3} min={0.1} max={6} step={0.05} onChange={setLightWidth} />}
        {isArea && <Slider label="Height" value={l.height ?? 3} min={0.1} max={6} step={0.05} onChange={setLightHeight} />}
      </div>

      {isSpot && (
        <div className="sect">
          <div className="sect-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Gobo</span>
            <button className={'btn-sm' + (l.gobo?.enabled ? ' amber' : '')} title="Project a patterned cookie through this spot"
              onClick={() => setLightGobo({ enabled: !l.gobo?.enabled })}>{l.gobo?.enabled ? 'On' : 'Off'}</button>
          </div>
          {l.gobo?.enabled && (<>
            <div className="row">
              <span className="row-lead"><span className="kf-spacer" /><label>Pattern</label></span>
              <select value={l.gobo.pattern} onChange={e => setLightGobo({ pattern: e.target.value as GoboPattern })}
                style={{ flex: '0 0 auto', minWidth: 120 }}>
                {GOBO_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            {l.gobo.pattern === 'custom' && (
              <div className="row">
                <span className="row-lead"><span className="kf-spacer" /><label>Image</label></span>
                <label className="hdri-pick" title={l.gobo.customName || 'Load a gobo image (PNG/JPG)'}>
                  {l.gobo.customUrl
                    ? <img src={l.gobo.customUrl} alt={l.gobo.customName || ''} style={{ width: 40, height: 40, objectFit: 'cover', display: 'block' }} />
                    : <span className="hdri-empty" style={{ fontSize: 11 }}>Load</span>}
                  <span className="hdri-ovl">{l.gobo.customUrl ? 'Replace' : 'Load'}</span>
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setLightGobo({ customUrl: URL.createObjectURL(f), customName: f.name }); e.target.value = ''; }} />
                </label>
              </div>
            )}
            <Slider label="Scale" value={l.gobo.size} min={0.25} max={4} step={0.05} onChange={v => setLightGobo({ size: v })} />
            <Slider label="Rotation" value={Math.round(l.gobo.rotation)} min={0} max={360} step={1} unit="°" onChange={v => setLightGobo({ rotation: v })} />
            <Slider label="Softness" value={round(1 - l.gobo.sharpness, 2)} min={0} max={1} step={0.05} onChange={v => setLightGobo({ sharpness: 1 - v })} />
            <Slider label="Contrast" value={l.gobo.contrast} min={0} max={1} step={0.05} onChange={v => setLightGobo({ contrast: v })} />
          </>)}
        </div>
      )}

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

      {positional && <LightSpeedCurve l={l} />}
      </>)}
    </>
  );
}