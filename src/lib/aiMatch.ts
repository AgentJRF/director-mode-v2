// Client-side AI match (image + video), Wizard-of-Oz. Runs WITHOUT the Vite dev server so the demo
// works on a static host (Vercel). Order for each: baked pose (by file-name substring) → dev-server
// endpoint (real Claude vision in `npm run dev`; absent on a static build) → local heuristic.
import type { Vec3, Ease } from '../types';
import type { LightPresetKind, LightPreset } from './lightPresets';
import { LIGHT_PRESETS } from './lightPresets';

// ---- image (camera pose) --------------------------------------------------
export type ExactPose = { position: Vec3; rotation: Vec3; focal: number; aperture: number; focusPoint: Vec3 | null };
export type CameraEstimate = {
  azimuth_deg: number; elevation_deg: number; distance_factor: number; focal_mm: number;
  aperture_f: number; confidence: number; reasoning: string; mocked?: boolean; pose?: ExactPose;
};

const LOWEPRO_BACKPACK: CameraEstimate = {
  azimuth_deg: -163, elevation_deg: 7, distance_factor: 2.4, focal_mm: 50, aperture_f: 8, confidence: 0.9,
  reasoning: 'Rear 3/4 of the backpack at near eye-level: harness and back panel to camera, body turned away. Standard ~50mm framing, deep focus (even product lighting, minimal bokeh).',
  mocked: false,
  pose: { position: [-1.86, 2.09, -6.06], rotation: [-6.7, -163.1, 0], focal: 50, aperture: 8, focusPoint: [-0.01, 1.33, 0.07] },
};
const ORANGE_DETAIL: CameraEstimate = {
  azimuth_deg: -7, elevation_deg: 64, distance_factor: 1.1, focal_mm: 37, aperture_f: 1.4, confidence: 0.85,
  reasoning: 'Macro detail: high, close top-down on the zip line; shallow depth (f/1.4) → strong bokeh, ~37mm.',
  mocked: false,
  pose: { position: [-0.11, 3.27, 0.94], rotation: [-50.45, -8.45, 6.34], focal: 37, aperture: 1.4, focusPoint: [0.12, 1.3, -0.67] },
};
const ORANGE_ZIP_FRONT: CameraEstimate = {
  azimuth_deg: 7, elevation_deg: 59, distance_factor: 1.3, focal_mm: 50, aperture_f: 1.4, confidence: 0.88,
  reasoning: 'Frontal macro on the zip line: close and slightly high, shallow depth (f/1.4) → strong bokeh on the handles/background, ~50mm.',
  mocked: false,
  pose: { position: [0.15, 3.06, 1.29], rotation: [-36.52, 7.6, -4.46], focal: 50, aperture: 1.4, focusPoint: [0.01, 2.032, -0.02] },
};
// order matters: `find` returns the FIRST match → specific keys before generic ones.
const CAMERA_DEMO: [string, CameraEstimate][] = [
  ['lining', ORANGE_ZIP_FRONT],
  ['backpack', LOWEPRO_BACKPACK], ['lowepro', LOWEPRO_BACKPACK], ['protactic', LOWEPRO_BACKPACK],
  ['gill', LOWEPRO_BACKPACK], ['duffel', LOWEPRO_BACKPACK], ['holdall', LOWEPRO_BACKPACK],
  ['orange', ORANGE_DETAIL], ['zip', ORANGE_DETAIL], ['detail', ORANGE_DETAIL], ['macro', ORANGE_DETAIL],
];
function imageHeuristic(w?: number, h?: number): CameraEstimate {
  const ar = (w || 1) / (h || 1);
  const focal = ar < 0.85 ? 85 : ar > 1.5 ? 28 : 50;
  return { azimuth_deg: 32, elevation_deg: 12, distance_factor: 2.6, focal_mm: focal, aperture_f: 2.8, confidence: 0.4,
    reasoning: 'Heuristic estimate — no baked match and no AI backend on this host. Adjust the sliders to taste.', mocked: true };
}

export async function matchCamera(p: { name?: string; width?: number; height?: number; imageBase64?: string; mediaType?: string }): Promise<CameraEstimate> {
  const name = (p.name || '').toLowerCase();
  const demo = CAMERA_DEMO.find(([k]) => name.includes(k));
  if (demo) return demo[1];
  const dev = await tryJson('/api/match-camera', p);
  return (dev as CameraEstimate) ?? imageHeuristic(p.width, p.height);
}

// ---- camera from a text prompt (offline, no LLM — the proto ships as a static share) ----------------
// Keyword-driven framing: angle + side, height, distance, focal and depth-of-field parsed from the text.
export type CameraPrompt = { azimuth: number; elevation: number; distance: number; focal: number; aperture: number; confidence: number; reasoning: string };
export function cameraFromPrompt(text: string): CameraPrompt {
  const t = (text || '').toLowerCase();
  const has = (...w: string[]) => w.some(x => t.includes(x));
  const cues: string[] = [];

  // Angle around the product (+ side). Magnitude from the shot type, sign from left/right.
  let mag = 35, note = 'three-quarter';               // default 3/4
  if (has('profile', 'side on', 'side-on', 'from the side')) { mag = 90; note = 'profile'; }
  else if (has('front', 'straight on', 'straight-on', 'face on', 'head on', 'head-on')) { mag = 0; note = 'front'; }
  else if (has('back', 'rear', 'behind', 'from behind')) { mag = 180; note = 'rear'; }
  else if (has('three-quarter', '3/4', '3-quarter', 'quarter')) { mag = 35; note = 'three-quarter'; }
  const sign = has('left') ? -1 : 1;
  const azimuth = mag === 0 || mag === 180 ? mag : mag * sign;
  cues.push(`${note}${mag !== 0 && mag !== 180 ? (sign < 0 ? ' (left)' : ' (right)') : ''}`);

  // Height.
  let elevation = 12;
  if (has('low angle', 'low-angle', 'from below', 'worm', 'hero angle')) { elevation = -8; cues.push('low angle'); }
  else if (has('top-down', 'top down', 'overhead', 'birds', "bird's", 'flat lay', 'flat-lay', 'from above', 'high angle')) { elevation = 60; cues.push('high / top-down'); }
  else if (has('eye level', 'eye-level')) { elevation = 8; cues.push('eye level'); }

  // Distance / framing.
  let distance = 2.6;
  if (has('close-up', 'closeup', 'close up', 'macro', 'detail', 'tight', 'extreme close')) { distance = 1.6; cues.push('close'); }
  else if (has('wide', 'establishing', 'far', 'full shot', 'full-body', 'pull back', 'pulled back')) { distance = 4.5; cues.push('wide'); }
  else if (has('medium')) { distance = 2.8; cues.push('medium'); }

  // Focal length.
  let focal = 50;
  if (has('macro')) focal = 100;
  else if (has('telephoto', 'tele ', 'long lens', '135')) focal = 135;
  else if (has('portrait', '85')) focal = 85;
  else if (has('wide-angle', 'wide angle', 'wide', '24mm', '35mm')) focal = 28;
  else if (has('normal', 'standard', '50mm', 'nifty fifty')) focal = 50;
  if (focal !== 50) cues.push(`${focal}mm`);

  // Depth of field → aperture.
  let aperture = 5.6;
  if (has('shallow', 'bokeh', 'blurred background', 'blurry background', 'creamy', 'soft background', 'dof')) { aperture = 1.8; cues.push('shallow DoF'); }
  else if (has('deep focus', 'deep-focus', 'everything sharp', 'sharp throughout', 'deep depth', 'all in focus')) { aperture = 13; cues.push('deep focus'); }

  const hits = cues.length;
  const confidence = Math.min(0.9, 0.55 + hits * 0.08);
  const reasoning = hits ? `Interpreted: ${cues.join(', ')}. Composed the framing — tweak the fields after.` : 'No strong cue → a neutral 3/4 framing. Add words like “low angle”, “close-up”, “wide”, “shallow depth”.';
  return { azimuth, elevation, distance, focal, aperture, confidence, reasoning };
}

// ---- video (camera move) --------------------------------------------------
export type MotionStepT = { az: number; el: number; dist: number; focal: number; aperture: number };
export type MotionKeyT = { t: number; pos: Vec3; ease: Ease; tOut?: Vec3; tIn?: Vec3 };
export type MotionExactT = { target: Vec3 | null; focal: number; aperture: number; duration: number; keys: MotionKeyT[] };
export type MotionEstimateT = {
  gesture: string; duration: number; ease: Ease; start: MotionStepT; end: MotionStepT;
  confidence: number; reasoning: string; mocked?: boolean; exact?: MotionExactT;
};

const COFFEE_REVEAL: MotionEstimateT = {
  gesture: 'push-out + crane-up (tight → wide)', duration: 1.73, ease: 'easeInOut',
  start: { az: 0, el: 6, dist: 2.1, focal: 50, aperture: 4 },
  end: { az: 0, el: 20, dist: 3.6, focal: 50, aperture: 4 },
  confidence: 0.83,
  reasoning: 'Face-on reveal that opens up: starts tight at a near eye-level hero framing, then cranes up and pulls back to a wider view at a gentle high angle; the product stays centered and straight-front (no orbit). ~1.7s.',
  mocked: false,
  exact: {
    target: [0, 1.5, 0], focal: 50, aperture: 4, duration: 1.73,
    keys: [
      { t: 0, pos: [0, 1.704, 5.418], ease: 'linear', tOut: [0.012, -0.052, 1.064] },
      { t: 1.73, pos: [0, 3.777, 7.71], ease: 'easeInOut', tIn: [0.002, -1.125, -0.042] },
    ],
  },
};
const MOTION_DEMO: [string, MotionEstimateT][] = [
  ['coffee', COFFEE_REVEAL], ['machine', COFFEE_REVEAL], ['packshot', COFFEE_REVEAL],
];
function motionHeuristic(): MotionEstimateT {
  return {
    gesture: 'orbital reveal', duration: 3, ease: 'easeInOut',
    start: { az: -35, el: 18, dist: 3.0, focal: 50, aperture: 4 },
    end: { az: 35, el: 12, dist: 2.6, focal: 50, aperture: 4 },
    confidence: 0.4,
    reasoning: 'Heuristic motion — no baked match for this clip. Defaulting to a gentle orbital reveal (baked camera moves are keyed by file name).',
    mocked: true,
  };
}

export async function matchMotion(name: string): Promise<MotionEstimateT> {
  const n = (name || '').toLowerCase();
  const demo = MOTION_DEMO.find(([k]) => n.includes(k));
  if (demo) return demo[1];
  const dev = await tryJson('/api/match-motion', { name });
  return (dev as MotionEstimateT) ?? motionHeuristic();
}

// ---- lighting (match a reference image → a light rig / preset) -------------
export type LightingMetrics = { lum: number; warmth: number; sat: number }; // 0..1 luminance, -1..1 warm-cool, 0..1 saturation
// A matched estimate can carry a BESPOKE rig (built to fit the reference) rather than a named preset.
// When `rig` is present the modal applies it verbatim; otherwise it falls back to the named `preset`.
export type LightingEstimate = { preset: LightPresetKind; label: string; confidence: number; reasoning: string; mocked?: boolean; rig?: LightPreset };

// Bespoke rig reconstructed from a warm, low-sun BACKLIT reference (e.g. a product shot at golden hour):
// the sun sits low and BEHIND-LEFT (strong rim + long shadow toward camera), a warm ground-bounce fill
// opens the shaded face, a second warm kicker catches the near top edge, over a bright warm ambient.
const GOLDEN_BACKLIT: LightPreset = {
  kind: 'golden-hour', label: 'Golden hour (matched)', selectRole: 'key',
  envIntensity: 0.55, envColor: '#ffd7a1',
  lights: [
    // Sun — low, warm, behind-left: reads as a bright rim on the near edge + a long cast shadow.
    { role: 'key', kind: 'spot', az: -152, el: 10, distMul: 1.4, intensity: 18, color: '#ff9a4d', castShadow: true, angle: 0.62, penumbra: 0.7 },
    // Warm bounce fill — front-left, soft, low: lifts the shaded face like grass/ground bounce.
    { role: 'fill', kind: 'area', az: -28, el: 12, distMul: 1.3, intensity: 3.2, color: '#ffca99', castShadow: false, sizeMul: 1 },
    // Warm kicker — high behind-left: extra glow on the top/near edge the sun grazes.
    { role: 'rim', kind: 'spot', az: -118, el: 30, distMul: 1.15, intensity: 8, color: '#ffb877', castShadow: false, angle: 0.7, penumbra: 0.9 },
  ],
};
const GOLDEN_BACKLIT_EST: LightingEstimate = {
  preset: 'golden-hour', label: 'Golden hour (matched)', confidence: 0.9, rig: GOLDEN_BACKLIT,
  reasoning: 'Warm, low sun behind-left → strong rim + long shadow, warm ground bounce on the shaded face, bright golden ambient. Rig built to match the reference, not a stock preset.',
};

const LIGHTING_DEMO: [string, LightingEstimate][] = [
  ['backpack', GOLDEN_BACKLIT_EST], ['lowepro', GOLDEN_BACKLIT_EST], ['protactic', GOLDEN_BACKLIT_EST],
  ['mountain', GOLDEN_BACKLIT_EST], ['outdoor', GOLDEN_BACKLIT_EST], ['hike', GOLDEN_BACKLIT_EST],
  ['sunset', GOLDEN_BACKLIT_EST], ['golden', GOLDEN_BACKLIT_EST],
  ['neon', { preset: 'neon', label: 'Neon', confidence: 0.88, reasoning: 'Saturated coloured key/rim over a dark ambient — night/neon look.' }],
  ['studio', { preset: 'softbox', label: 'Softbox', confidence: 0.86, reasoning: 'Bright, even, soft light — clean studio packshot.' }],
  ['dramatic', { preset: 'dramatic', label: 'Dramatic', confidence: 0.85, reasoning: 'Single hard key, deep shadows — chiaroscuro.' }],
];
const LABEL: Record<LightPresetKind, string> = {
  'three-point': 'Three-point', gobo: 'Gobo', 'golden-hour': 'Golden hour', softbox: 'Softbox', dramatic: 'Dramatic', neon: 'Neon',
};
// Heuristic: map the reference's overall tone to a lighting preset (real-ish signal from the image).
function lightingHeuristic(m: LightingMetrics): LightingEstimate {
  let preset: LightPresetKind; let why: string;
  if (m.sat > 0.5 && m.lum < 0.6) { preset = 'neon'; why = 'Saturated colours over darker midtones → coloured key/rim (neon).'; }
  else if (m.lum < 0.32) { preset = 'dramatic'; why = 'Low-key, high-contrast reference → single hard key with deep shadows.'; }
  // Warm tone → reconstruct the bespoke golden-hour BACKLIGHT rig (not the flat preset) to match the image.
  else if (m.warmth > 0.14) { return { ...GOLDEN_BACKLIT_EST, confidence: 0.6, mocked: true, reasoning: 'Warm image tone → reconstructed a golden-hour backlight rig (low warm sun behind-left + warm bounce). Tweak the lights after.' }; }
  else if (m.lum > 0.62 && m.sat < 0.35) { preset = 'softbox'; why = 'Bright, even, low-saturation reference → soft studio boxes.'; }
  else { preset = 'three-point'; why = 'Balanced reference → a neutral three-point rig.'; }
  return { preset, label: LABEL[preset], confidence: 0.55, reasoning: why + ' Estimated from the image tone — tweak the lights after.', mocked: true };
}

export async function matchLighting(p: { name?: string; metrics: LightingMetrics; imageBase64?: string; mediaType?: string }): Promise<LightingEstimate> {
  const name = (p.name || '').toLowerCase();
  const demo = LIGHTING_DEMO.find(([k]) => name.includes(k));
  if (demo) return demo[1];
  const dev = await tryJson('/api/match-lighting', p);
  return (dev as LightingEstimate) ?? lightingHeuristic(p.metrics);
}

// Text → lighting. Wizard-of-Oz (offline, no LLM — the proto is a static share): pick the closest look
// from a keyword vocabulary, THEN adjust that rig from modifier words (warm/cool, bright/dark,
// soft/hard, strong/subtle). Always returns an editable declarative rig, never a black box.
const preset = (k: LightPresetKind): LightPreset => LIGHT_PRESETS.find(p => p.kind === k)!;
const PROMPT_LOOKS: { base: () => LightPreset; label: string; cue: string; words: string[] }[] = [
  { base: () => preset('neon'), label: 'Neon', cue: 'night / colour',
    words: ['neon', 'cyberpunk', 'night', 'club', 'bi-color', 'bicolor', 'bi color', 'teal', 'magenta', 'purple', 'synthwave', 'colourful', 'colorful'] },
  { base: () => GOLDEN_BACKLIT, label: 'Golden hour', cue: 'warm / sunset / backlit',
    words: ['golden', 'sunset', 'sunrise', 'backlit', 'back light', 'backlight', 'rim', 'sun', 'outdoor', 'hour', 'amber', 'hazy'] },
  { base: () => preset('dramatic'), label: 'Dramatic', cue: 'hard / moody / low-key',
    words: ['dramatic', 'moody', 'chiaroscuro', 'noir', 'low key', 'low-key', 'spotlight', 'single light', 'high contrast'] },
  { base: () => preset('softbox'), label: 'Softbox', cue: 'clean / soft / product',
    words: ['softbox', 'studio', 'packshot', 'product', 'ecommerce', 'e-commerce', 'clean', 'even', 'catalog', 'catalogue', 'minimal'] },
  { base: () => preset('gobo'), label: 'Gobo', cue: 'patterned light',
    words: ['gobo', 'blinds', 'window', 'pattern', 'dappled', 'venetian', 'foliage', 'caustics', 'cookie'] },
  { base: () => preset('three-point'), label: 'Three-point', cue: 'balanced / neutral',
    words: ['three-point', 'three point', '3-point', 'balanced', 'neutral', 'classic', 'standard', 'portrait'] },
];

// Modifiers parsed from the prompt, each in [-1, 1] (0 = leave the base rig alone).
type Mods = { warm: number; bright: number; soft: number; power: number };
function parseMods(t: string): Mods {
  const any = (arr: string[]) => arr.some(w => t.includes(w));
  const d = (pos: string[], neg: string[]) => (any(pos) ? 1 : 0) - (any(neg) ? 1 : 0);
  return {
    warm: d(['warm', 'warmer', 'amber', 'golden', 'orange', 'cozy', 'sunset'], ['cool', 'cold', 'colder', 'blue', 'cyan', 'teal', 'icy', 'moonlight']),
    bright: d(['bright', 'brighter', 'high key', 'high-key', 'airy', 'luminous', 'lit'], ['dark', 'darker', 'dim', 'dimmer', 'low key', 'low-key', 'moody', 'shadowy']),
    soft: d(['soft', 'softer', 'diffuse', 'diffused', 'gentle', 'smooth', 'wrap'], ['hard', 'harder', 'sharp', 'crisp', 'harsh', 'punchy', 'defined']),
    power: d(['strong', 'stronger', 'intense', 'powerful', 'bold', 'punchy'], ['subtle', 'faint', 'weak', 'delicate', 'gentle']),
  };
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return '#' + m(ar, br) + m(ag, bg) + m(ab, bb);
}
const WARM = '#ffb060', COOL = '#bcd4ff';
function adjustRig(base: LightPreset, m: Mods, label: string): LightPreset {
  const lights = base.lights.map(s => {
    let color = s.color;
    if (m.warm !== 0) color = mixHex(s.color ?? '#ffffff', m.warm > 0 ? WARM : COOL, 0.35 * Math.abs(m.warm));
    const gain = 1 + 0.25 * m.bright + 0.3 * m.power * (s.role === 'key' ? 1 : 0.4);
    const intensity = +(s.intensity * gain).toFixed(1);
    const penumbra = s.penumbra === undefined || m.soft === 0 ? s.penumbra : +clamp01(s.penumbra + 0.3 * m.soft).toFixed(2);
    return { ...s, color, intensity, penumbra };
  });
  let envIntensity = base.envIntensity;
  if (envIntensity !== undefined) envIntensity = +Math.max(0.02, envIntensity * (1 + 0.4 * m.bright)).toFixed(2);
  let envColor = base.envColor;
  if (m.warm !== 0) envColor = mixHex(envColor ?? '#ffffff', m.warm > 0 ? WARM : COOL, 0.3 * Math.abs(m.warm));
  return { ...base, label, envIntensity, envColor, lights };
}
function describeMods(m: Mods): string {
  const p: string[] = [];
  if (m.warm) p.push(m.warm > 0 ? 'warmer' : 'cooler');
  if (m.bright) p.push(m.bright > 0 ? 'brighter' : 'darker');
  if (m.soft) p.push(m.soft > 0 ? 'softer' : 'harder');
  if (m.power) p.push(m.power > 0 ? 'stronger key' : 'subtler key');
  return p.length ? `Adjusted: ${p.join(', ')}.` : '';
}
export function lightingFromPrompt(text: string): LightingEstimate {
  const t = (text || '').toLowerCase();
  let best: { look: typeof PROMPT_LOOKS[number]; score: number } | null = null;
  for (const look of PROMPT_LOOKS) {
    const score = look.words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { look, score };
  }
  const look = best?.look ?? PROMPT_LOOKS[PROMPT_LOOKS.length - 1]; // default: three-point
  const m = parseMods(t);
  const rig = adjustRig(look.base(), m, look.label);
  const mods = describeMods(m);
  const head = best ? `Interpreted “${look.cue}” → ${look.label}.` : 'No strong style cue → neutral three-point.';
  const confidence = best ? Math.min(0.9, 0.68 + best.score * 0.05) : 0.42;
  return { preset: rig.kind, label: rig.label, confidence, mocked: true, rig, reasoning: `${head}${mods ? ' ' + mods : ''} Built as an editable rig — tweak after.` };
}

// Try the dev-server endpoint; returns null on a static host (no endpoint → HTML/404/network error).
async function tryJson(url: string, body: unknown): Promise<unknown> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('application/json')) return await r.json();
  } catch { /* no dev server (static deploy) */ }
  return null;
}
