import type { Light, LightKind, Vec3, LightGobo } from '../types';
import { makeLight } from './lightRig';
import { defaultGobo } from './gobo';
import { OBJECT_FRAME } from './eval';
import { S, PIVOT } from '../store';

// ── Lighting presets ─────────────────────────────────────────────────────────
// A preset is DECLARATIVE: a list of light specs (role + spherical placement around the product).
// The same spec drives BOTH applyLightPreset (builds normal, editable Light entities — never a black
// box, mirroring lib/presets.ts for cameras) AND the placement schematic drawn in the UI, so adding
// a preset here automatically gets its diagram. Lights are placed relative to the pivot and
// OBJECT_FRAME.product, so a rig auto-scales to the loaded asset. Applying REPLACES the working
// lights but keeps the Environment (IBL).

export type LightPresetKind = 'three-point' | 'gobo' | 'golden-hour' | 'softbox' | 'dramatic' | 'neon';
export type LightRole = 'key' | 'fill' | 'rim';

export interface PresetLightSpec {
  role: LightRole;
  kind: LightKind;
  az: number;          // azimuth around Y, degrees — 0 = front (+Z, toward camera), + = right
  el: number;          // elevation above the horizon, degrees
  distMul: number;     // distance from pivot = OBJECT_FRAME.product · distMul
  intensity: number;
  castShadow?: boolean;
  angle?: number;      // spot cone half-angle (rad)
  penumbra?: number;   // spot edge softness
  sizeMul?: number;    // area emitter size = OBJECT_FRAME.product · sizeMul
  color?: string;      // light colour (hex) — defaults to white when omitted
  gobo?: Partial<LightGobo>; // spot only — projects a gobo/cookie (seeded from defaultGobo)
}

export interface LightPreset {
  kind: LightPresetKind;
  label: string;
  selectRole: LightRole;   // which light to select after applying
  envIntensity?: number;   // dim the environment/IBL to this level so the rig reads (undefined = leave it)
  envColor?: string;       // tint the environment (IBL) this colour for ambient mood (enables colorize)
  lights: PresetLightSpec[];
}

export const LIGHT_PRESETS: LightPreset[] = [
  {
    kind: 'three-point', label: 'Three-point', selectRole: 'key',
    // Drop the studio HDRI to a low ambient base so the rig actually shapes the product (a full-strength
    // IBL flattens the modelling). The user can raise the Environment again in its inspector.
    envIntensity: 0.35,
    lights: [
      // Key: strong, front-right, high — the main modelling light (only one that casts shadows).
      { role: 'key', kind: 'spot', az: 35, el: 35, distMul: 1.15, intensity: 14, castShadow: true, angle: 0.6, penumbra: 0.45 },
      // Fill: soft, front-left, low — a large area light that opens the shadows without killing contrast.
      { role: 'fill', kind: 'area', az: -48, el: 16, distMul: 1.3, intensity: 4, castShadow: false, sizeMul: 0.9 },
      // Rim: directly BEHIND and high — a strong back light that grazes the silhouette so the camera
      // sees a bright lit edge (rim). Rim/kickers must be intense (they only catch grazing edges).
      { role: 'rim', kind: 'spot', az: 168, el: 32, distMul: 1.1, intensity: 20, castShadow: false, angle: 0.8, penumbra: 1 },
    ],
  },
  {
    // A single gobo spot aimed at the product (with a soft fill so it isn't pitch-black). The spot
    // carries a default gobo (Blinds) — switch the pattern from the dropdown in its inspector.
    kind: 'gobo', label: 'Gobo', selectRole: 'key', envIntensity: 0.3,
    lights: [
      { role: 'key', kind: 'spot', az: 22, el: 30, distMul: 0.8, intensity: 11, castShadow: true, angle: 0.5, penumbra: 0.35,
        gobo: { enabled: true, pattern: 'blinds', size: 1, rotation: 0, sharpness: 0.85, contrast: 1 } },
      { role: 'fill', kind: 'area', az: -46, el: 14, distMul: 1.35, intensity: 2.5, castShadow: false, sizeMul: 0.9 },
    ],
  },
  {
    // Low, warm side sun + warm fill + golden rim over a warm ambient — sunset mood.
    kind: 'golden-hour', label: 'Golden hour', selectRole: 'key', envIntensity: 0.5, envColor: '#ffe2c2',
    lights: [
      { role: 'key', kind: 'spot', az: 52, el: 12, distMul: 1.3, intensity: 13, color: '#ffca90', castShadow: true, angle: 0.7, penumbra: 0.5 },
      { role: 'fill', kind: 'area', az: -48, el: 18, distMul: 1.35, intensity: 3, color: '#ffe6cf', castShadow: false, sizeMul: 1 },
      { role: 'rim', kind: 'spot', az: 150, el: 34, distMul: 1.1, intensity: 9, color: '#ffd9a8', castShadow: false, angle: 0.7, penumbra: 0.8 },
    ],
  },
  {
    // Two big soft boxes + gentle rim, brighter neutral ambient — clean e-commerce packshot.
    kind: 'softbox', label: 'Softbox', selectRole: 'key', envIntensity: 0.6,
    lights: [
      // Tuned on-asset: smaller boxes than a huge wrap → a touch more shaping. (sizeMul relative to R≈6.)
      { role: 'key', kind: 'area', az: 32, el: 28, distMul: 1.25, intensity: 5, castShadow: true, sizeMul: 0.42 },
      { role: 'fill', kind: 'area', az: -36, el: 20, distMul: 1.3, intensity: 4, castShadow: false, sizeMul: 0.5 },
      { role: 'rim', kind: 'spot', az: 165, el: 40, distMul: 1.1, intensity: 4, castShadow: false, angle: 0.785, penumbra: 1 },
    ],
  },
  {
    // Single hard key at 45° + faint rim, near-black ambient — chiaroscuro / deep shadows.
    kind: 'dramatic', label: 'Dramatic', selectRole: 'key', envIntensity: 0.1,
    lights: [
      { role: 'key', kind: 'spot', az: 45, el: 42, distMul: 1.15, intensity: 17, castShadow: true, angle: 0.5, penumbra: 0.12 },
      { role: 'rim', kind: 'spot', az: 168, el: 30, distMul: 1.1, intensity: 6, castShadow: false, angle: 0.7, penumbra: 1 },
    ],
  },
  {
    // Teal key + magenta rim over a dark cool ambient — stylised neon night look (shows off colour).
    kind: 'neon', label: 'Neon', selectRole: 'key', envIntensity: 0.14, envColor: '#8c93e8',
    lights: [
      { role: 'key', kind: 'spot', az: -53.93, el: 6.98, distMul: 1.161, intensity: 19.3, color: '#00e5e5', castShadow: true, angle: 0.384, penumbra: 0.6 },
      { role: 'rim', kind: 'spot', az: 158, el: 34, distMul: 1.1, intensity: 13, color: '#ff1fd0', castShadow: false, angle: 0.698, penumbra: 0.8 },
    ],
  },
];

const roleName = (r: LightRole) => r.charAt(0).toUpperCase() + r.slice(1);

// Spherical (az/el) → a world position at `dist` from the pivot.
export function specPosition(az: number, el: number, dist: number): Vec3 {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const dir: Vec3 = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  return [
    +(PIVOT.x + dir[0] * dist).toFixed(3),
    +(PIVOT.y + dir[1] * dist).toFixed(3),
    +(PIVOT.z + dir[2] * dist).toFixed(3),
  ];
}

function buildLight(spec: PresetLightSpec, R: number, group?: string): Light {
  const position = specPosition(spec.az, spec.el, R * spec.distMul);
  const pivotArr: Vec3 = [PIVOT.x, PIVOT.y, PIVOT.z];
  const over: Partial<Light> = {
    intensity: spec.intensity,
    castShadow: spec.castShadow,
    transform: { position, rotation: [0, 0, 0] },
    target: { type: 'point', point: pivotArr }, // aim at the product (look-at)
  };
  if (spec.kind === 'spot') { over.angle = spec.angle ?? 0.6; over.penumbra = spec.penumbra ?? 0.5; }
  if (spec.kind === 'area') { const s = R * (spec.sizeMul ?? 0.9); over.width = +s.toFixed(2); over.height = +s.toFixed(2); }
  if (spec.color) over.color = spec.color;
  if (spec.gobo) over.gobo = { ...defaultGobo(), ...spec.gobo };
  if (group) over.group = group;
  return makeLight(spec.kind, roleName(spec.role), over);
}

// Make a group name unique against the groups present in `among` (Softbox → Softbox 2, …).
function uniqueGroup(base: string, among: Light[]): string {
  const used = new Set(among.map(l => l.group).filter(Boolean) as string[]);
  if (!used.has(base)) return base;
  let i = 2; while (used.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

// Apply ANY declarative rig (built-in preset OR a bespoke one, e.g. from the AI match).
// KEEPS the environment/IBL (and cameras, untouched).
//  - default (replace): swaps the working rig — used by the AI lighting flows (set up the scene).
//  - opts.add: APPENDS the rig as a named group, leaving existing lights in place (preset gallery).
export function applyRig(preset: LightPreset, opts?: { add?: boolean }) {
  const st = S(); const p = st.project;
  const R = OBJECT_FRAME.product || 6;
  const add = !!opts?.add;
  // add mode → keep the environment + manually-placed lights (no group), but DROP any previously-applied
  // preset (its lights carry a group). So applying a preset replaces the last preset, never a hand-placed light.
  const keep = add ? p.lights.filter(l => l.kind !== 'env' && !l.group) : [];
  const group = add ? uniqueGroup(preset.label, keep) : undefined;

  const rig = preset.lights.map(spec => buildLight(spec, R, group));

  const env = p.lights.filter(l => l.kind === 'env');
  env.forEach(e => {
    if (preset.envIntensity !== undefined) e.intensity = preset.envIntensity;
    // Tint the IBL for mood (golden/neon), or clear a previous preset's tint back to neutral.
    if (preset.envColor) { e.color = preset.envColor; e.colorize = true; }
    else e.colorize = false;
  });
  p.lights = [...env, ...keep, ...rig];
  const sel = rig[preset.lights.findIndex(s => s.role === preset.selectRole)] ?? rig[0];
  p.activeLightId = sel.id; st.ui.inspect = 'light';
  st.bump(); st.toast(add ? `${preset.label} added` : `${preset.label} lighting applied`);
}

export function applyLightPreset(kind: LightPresetKind, opts?: { add?: boolean }) {
  const preset = LIGHT_PRESETS.find(x => x.kind === kind);
  if (preset) applyRig(preset, opts);
}
