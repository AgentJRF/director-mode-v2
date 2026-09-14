import { useState } from 'react';
import { useRev } from './bits';
import { LIGHT_PRESETS, applyLightPreset } from '../lib/lightPresets';
import type { LightPreset, PresetLightSpec, LightRole, LightPresetKind } from '../lib/lightPresets';
import { goboThumb } from '../lib/gobo';
import type { GoboPattern } from '../types';

// Role tints for the schematic (the beams — the actual lamps are white).
const ROLE_COLOR: Record<LightRole, string> = { key: '#f0b64a', fill: '#4a90d9', rim: '#e7e0cd' };

// 3D unit direction from the subject toward a light (0° az = front/+Z, +az = right).
function dirOf(s: PresetLightSpec): [number, number, number] {
  const a = (s.az * Math.PI) / 180, e = (s.el * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

const CX = 100, CY = 62, R = 22, SPREAD = 72;
// ¾-view projection of a light direction to screen: front (dz>0) sits lower, back (dz<0) higher.
function project(d: [number, number, number]) {
  return { gx: CX + d[0] * SPREAD, gy: CY - d[1] * SPREAD * 0.72 + d[2] * SPREAD * 0.2, behind: d[2] < -0.1 };
}

// A ¾-view scene: a neutral GRAY sphere "asset" on the ground, with a visible cone of light (flux)
// flowing from each lamp onto the sphere, plus the key highlight + a rim edge so you read the look.
function PresetScene({ preset }: { preset: LightPreset }) {
  const key = preset.lights.find(l => l.role === 'key');
  const kd = key ? dirOf(key) : [0.5, 0.5, 0.6];
  const hx = 0.5 + kd[0] * 0.3, hy = 0.5 - kd[1] * 0.3;   // gray highlight toward the key
  const gid = `sph-${preset.kind}`;
  const rim = preset.lights.find(l => l.role === 'rim');
  const rd = rim ? dirOf(rim) : [-0.4, 0.5, -0.7];
  const rimAngle = Math.atan2(-rd[1], rd[0]);
  const rimA: [number, number] = [CX + Math.cos(rimAngle - 0.55) * R, CY + Math.sin(rimAngle - 0.55) * R];
  const rimB: [number, number] = [CX + Math.cos(rimAngle + 0.55) * R, CY + Math.sin(rimAngle + 0.55) * R];

  return (
    <svg viewBox="0 0 200 140" width="100%" style={{ display: 'block', background: '#17181c', borderRadius: 7 }}
      role="img" aria-label={`${preset.label} lighting: gray sphere lit by ${preset.lights.map(l => l.role).join(', ')}`}>
      <defs>
        <radialGradient id={gid} cx={hx} cy={hy} r="0.85">
          <stop offset="0%" stopColor="#eceef0" />
          <stop offset="42%" stopColor="#b7bac0" />
          <stop offset="74%" stopColor="#6d7075" />
          <stop offset="100%" stopColor="#33353a" />
        </radialGradient>
      </defs>

      <ellipse cx={CX} cy={116} rx={90} ry={16} fill="#202127" />
      <ellipse cx={CX} cy={94} rx={R * 1.3} ry={7} fill="#000" opacity="0.4" />

      {/* light flux — a soft cone from each lamp onto the sphere */}
      {preset.lights.map((l, i) => {
        const { gx, gy, behind } = project(dirOf(l));
        const dx = CX - gx, dy = CY - gy, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, px = -uy, py = ux;
        const nearX = CX - ux * R, nearY = CY - uy * R;   // sphere surface facing the lamp
        const sh = 3.5, bh = R * 0.85;                     // source half-width, base half-width
        const poly = [
          [gx + px * sh, gy + py * sh], [nearX + px * bh, nearY + py * bh],
          [nearX - px * bh, nearY - py * bh], [gx - px * sh, gy - py * sh],
        ].map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
        return (
          <g key={'b' + i} opacity={behind ? 0.45 : 1}>
            <polygon points={poly} fill={ROLE_COLOR[l.role]} opacity={behind ? 0.07 : 0.16} />
            <line x1={gx.toFixed(1)} y1={gy.toFixed(1)} x2={(nearX).toFixed(1)} y2={(nearY).toFixed(1)}
              stroke={ROLE_COLOR[l.role]} strokeWidth={1.3} opacity={behind ? 0.35 : 0.7}
              strokeDasharray={behind ? '3 3' : undefined} />
          </g>
        );
      })}

      {/* the gray asset sphere */}
      <circle cx={CX} cy={CY} r={R} fill={`url(#${gid})`} />
      {/* rim edge highlight */}
      <path d={`M${rimA[0].toFixed(1)} ${rimA[1].toFixed(1)} A ${R} ${R} 0 0 1 ${rimB[0].toFixed(1)} ${rimB[1].toFixed(1)}`}
        fill="none" stroke={ROLE_COLOR.rim} strokeWidth={rim ? 2.4 : 0} strokeLinecap="round" opacity="0.85" />

      {/* lamp glyphs at their real placement */}
      {preset.lights.map((l, i) => {
        const { gx, gy, behind } = project(dirOf(l));
        const col = ROLE_COLOR[l.role];
        return (
          <g key={'g' + i} opacity={behind ? 0.7 : 1}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
              const rad = (a * Math.PI) / 180;
              return <line key={a} x1={(gx + Math.cos(rad) * 5.5).toFixed(1)} y1={(gy + Math.sin(rad) * 5.5).toFixed(1)}
                x2={(gx + Math.cos(rad) * 8).toFixed(1)} y2={(gy + Math.sin(rad) * 8).toFixed(1)} stroke={col} strokeWidth={1} strokeLinecap="round" />;
            })}
            <circle cx={gx.toFixed(1)} cy={gy.toFixed(1)} r={4.4} fill={col} />
            <text x={gx.toFixed(1)} y={(gy + 2.6).toFixed(1)} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#17181c"
              fontFamily="sans-serif">{l.role[0].toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

// The gobo pattern a preset carries (if any) — its card shows the gobo projected on a sphere instead
// of the light-placement schematic.
function presetGobo(preset: LightPreset): GoboPattern | undefined {
  return preset.lights.find(l => l.gobo)?.gobo?.pattern as GoboPattern | undefined;
}
function GoboPreview({ pattern }: { pattern: GoboPattern }) {
  const src = goboThumb(pattern);
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '10 / 7', background: '#17181c', borderRadius: 7, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '62%', aspectRatio: '1 / 1', borderRadius: '50%',
        background: 'radial-gradient(circle at 34% 30%, #eceef0, #b7bac0 42%, #6d7075 74%, #33353a 100%)',
      }}>
        {src && <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', mixBlendMode: 'multiply' }} />}
      </div>
    </div>
  );
}

export default function LightingPresets() {
  useRev();
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState<LightPresetKind | null>(null);
  return (
    <div className="sect">
      <div className="sect-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .12s' }}>
          <path d="M2.5 4 5 6.5 7.5 4" /></svg>
        Lighting presets
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
          {LIGHT_PRESETS.map(preset => {
            const on = sel === preset.kind;
            return (
              <div key={preset.kind} className="lp-card"
                onClick={() => setSel(preset.kind)}
                title={preset.label}
                style={{
                  padding: 6, cursor: 'pointer', background: 'var(--panel-2)',
                  border: `${on ? 2 : 1}px solid ${on ? 'var(--blue)' : 'var(--line-2)'}`,
                  borderRadius: 9,
                }}>
                {presetGobo(preset) ? <GoboPreview pattern={presetGobo(preset)!} /> : <PresetScene preset={preset} />}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-1)' }}>{preset.label}</span>
                  {on && (
                    <button className="btn-sm"
                      style={{ padding: '2px 10px', fontSize: 11, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 5 }}
                      onClick={e => { e.stopPropagation(); applyLightPreset(preset.kind); }}>Apply</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
