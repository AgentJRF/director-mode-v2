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

export type LightPresetKind = 'three-point' | 'gobo';
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
  gobo?: Partial<LightGobo>; // spot only — projects a gobo/cookie (seeded from defaultGobo)
}

export interface LightPreset {
  kind: LightPresetKind;
  label: string;
  selectRole: LightRole;   // which light to select after applying
  envIntensity?: number;   // dim the environment/IBL to this level so the rig reads (undefined = leave it)
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

function buildLight(spec: PresetLightSpec, R: number): Light {
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
  if (spec.gobo) over.gobo = { ...defaultGobo(), ...spec.gobo };
  return makeLight(spec.kind, roleName(spec.role), over);
}

export function applyLightPreset(kind: LightPresetKind) {
  const st = S(); const p = st.project;
  const preset = LIGHT_PRESETS.find(x => x.kind === kind);
  if (!preset) return;
  const R = OBJECT_FRAME.product || 6;

  const rig = preset.lights.map(spec => buildLight(spec, R));

  // Replace the working lights, KEEP the environment/IBL (and cameras, untouched).
  const env = p.lights.filter(l => l.kind === 'env');
  if (preset.envIntensity !== undefined) env.forEach(e => { e.intensity = preset.envIntensity!; });
  p.lights = [...env, ...rig];
  const sel = rig[preset.lights.findIndex(s => s.role === preset.selectRole)] ?? rig[0];
  p.activeLightId = sel.id; st.ui.inspect = 'light';
  st.bump(); st.toast(`${preset.label} lighting applied`);
}
