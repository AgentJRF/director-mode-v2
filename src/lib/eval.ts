import * as THREE from 'three';
import type { Camera, Channel, Ease, Vec3, Keyframe } from '../types';

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const uid = () => Math.random().toString(36).slice(2, 9);
export const round = (v: number, d = 2) => { const p = 10 ** d; return Math.round(v * p) / p; };

export const EASES: Record<Ease, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInOutStrong: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
export const EASE_LIST: Ease[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInOutStrong'];

export const CHANNELS: Channel[] = ['position', 'rotation', 'focalLength'];

const cloneVal = (v: Vec3 | number) => (Array.isArray(v) ? (v.slice() as Vec3) : v);

export function keysOf(cam: Camera, ch: Channel): Keyframe[] {
  return cam.keyframes.filter(k => k.channel === ch).sort((a, b) => a.time - b.time);
}

// Cubic Bézier point (component-wise) for a Vec3 control polygon.
export function bezier3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
}

// Tangent handle offset (relative to the key's value) for a position key.
// Explicit tangent if set, else auto = 1/3 of the chord to the neighbour (→ straight segment).
export function handleOffset(ks: Keyframe[], i: number, which: 'in' | 'out'): Vec3 {
  const k = ks[i];
  const explicit = which === 'out' ? k.tangentOut : k.tangentIn;
  if (explicit) return explicit;
  const n = which === 'out' ? ks[i + 1] : ks[i - 1];
  if (!n) return [0, 0, 0];
  const kv = k.value as Vec3, nv = n.value as Vec3;
  return [(nv[0] - kv[0]) / 3, (nv[1] - kv[1]) / 3, (nv[2] - kv[2]) / 3];
}
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const distv = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Arc-length reparameterization of a cubic Bézier segment.
// A Bézier's natural parameter `t` is NOT proportional to distance travelled, so pulling the
// tangent handles makes a "linear" ease look non-uniform (fast on straight bits, slow on bends).
// This maps a fraction of the segment's ARC LENGTH (0..1) — which is what the speed curve produces —
// to the natural parameter `t` that yields that distance, so the ease actually controls speed.
export function bezierArcParam(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, sFrac: number, samples = 32): number {
  if (sFrac <= 0) return 0;
  if (sFrac >= 1) return 1;
  const ts: number[] = [0];
  const cum: number[] = [0];
  let prev = p0;
  let total = 0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const pt = bezier3(p0, p1, p2, p3, t);
    total += distv(prev, pt);
    ts.push(t);
    cum.push(total);
    prev = pt;
  }
  if (total === 0) return sFrac; // degenerate segment (all control points coincident)
  const target = sFrac * total;
  let i = 1;
  while (i < samples && cum[i] < target) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const f = (target - cum[i - 1]) / segLen;
  return ts[i - 1] + f * (ts[i] - ts[i - 1]);
}

// The "speed curve" (ease) is stored per segment, on each segment's END key. When EVERY segment of a
// move shares one non-linear ease, apply it once across the WHOLE move instead of per segment —
// otherwise a preset's ease repeats on each hop and the motion "pumps" (slow-fast-slow per segment).
// Mixed eases (a key tuned individually) fall back to per-segment easing, preserving manual control.
export function uniformMoveEase(cam: Camera): Ease | null {
  const byCh: Record<string, Keyframe[]> = {};
  for (const k of cam.keyframes) { if (!byCh[k.channel]) byCh[k.channel] = []; byCh[k.channel].push(k); }
  let e: Ease | null = null;
  for (const ch in byCh) {
    const ks = byCh[ch].slice().sort((a, b) => a.time - b.time);
    for (let i = 1; i < ks.length; i++) { // segment-ending keys carry the ease
      if (e === null) e = ks[i].ease;
      else if (ks[i].ease !== e) return null;
    }
  }
  return e && e !== 'linear' ? e : null;
}

export function evalChannel(cam: Camera, ch: Channel, t: number): Vec3 | number {
  const ks = keysOf(cam, ch);
  const base = ch === 'focalLength' ? cam.optics.focalLength
    : ch === 'aperture' ? cam.optics.aperture
    : ch === 'motionBlur' ? cam.optics.motionBlurShutter
    : ch === 'poi' ? (cam.target?.type === 'point' && cam.target.point ? cam.target.point : ([0, 0.9, 0] as Vec3))
    : cam.transform[ch === 'position' ? 'position' : 'rotation'];
  if (ks.length === 0) return cloneVal(base);
  if (t <= ks[0].time) return cloneVal(ks[0].value);
  if (t >= ks[ks.length - 1].time) return cloneVal(ks[ks.length - 1].value);
  // Whole-move ease: remap time once across the entire move, then interpolate LINEARLY inside the
  // segment (the easing now lives in the remapped time). Falls back to per-segment ease when mixed.
  const moveEase = uniformMoveEase(cam);
  let tt = t;
  if (moveEase) {
    const t0 = ks[0].time, t1 = ks[ks.length - 1].time;
    const T = clamp((t - t0) / (t1 - t0 || 1), 0, 1);
    tt = t0 + (EASES[moveEase] || EASES.linear)(T) * (t1 - t0);
  }
  let i = 0; while (i < ks.length - 1 && ks[i + 1].time < tt) i++;
  const a = ks[i], b = ks[i + 1];
  const raw = clamp((tt - a.time) / (b.time - a.time || 1), 0, 1);
  const e = moveEase ? raw : (EASES[b.ease] || EASES.linear)(raw);
  if (ch === 'focalLength' || ch === 'aperture' || ch === 'motionBlur') return lerp(a.value as number, b.value as number, e);
  const av = a.value as Vec3, bv = b.value as Vec3;
  if (ch === 'position') {
    // cubic Bézier segment: P0=a, P1=a+outTangent(a), P2=b+inTangent(b), P3=b
    const p1 = addv(av, handleOffset(ks, i, 'out'));
    const p2 = addv(bv, handleOffset(ks, i + 1, 'in'));
    // The ease `e` is a fraction of ARC LENGTH; reparameterize so the speed curve controls actual
    // distance travelled regardless of how the tangent handles are pulled.
    const bt = bezierArcParam(av, p1, p2, bv, e);
    return bezier3(av, p1, p2, bv, bt);
  }
  return [lerp(av[0], bv[0], e), lerp(av[1], bv[1], e), lerp(av[2], bv[2], e)];
}

// Object bounding-box centers, registered by the scene so target look-at can resolve them.
export const OBJECT_CENTERS: Record<string, Vec3> = { product: [0, 0.9, 0], pedestal: [0, 0.25, 0] };
// Comfortable framing distance per object (world units) — used so preset departures aren't too tight.
export const OBJECT_FRAME: Record<string, number> = {};

// Scene objects exposed in the UI (target stack / outliner).
export const SCENE_OBJECTS: { id: string; label: string }[] = [
  { id: 'product', label: 'Product' },
  { id: 'pedestal', label: 'Pedestal' },
];

export function targetPoint(tg: NonNullable<Camera['target']>): Vec3 {
  if (tg.type === 'point' && tg.point) return tg.point;
  if (tg.objectId && OBJECT_CENTERS[tg.objectId]) return OBJECT_CENTERS[tg.objectId];
  return [0, 0.9, 0];
}

export function eulerFromLookAt(pos: Vec3, tp: Vec3): Vec3 {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...pos), new THREE.Vector3(...tp), new THREE.Vector3(0, 1, 0));
  const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
  return [THREE.MathUtils.radToDeg(e.x), THREE.MathUtils.radToDeg(e.y), THREE.MathUtils.radToDeg(e.z)];
}

export interface Pose { position: Vec3; rotation: Vec3; focalLength: number; aperture: number; motionBlur: number; }

export function evaluate(cam: Camera, t: number): Pose {
  const position = evalChannel(cam, 'position', t) as Vec3;
  let rotation = evalChannel(cam, 'rotation', t) as Vec3;
  const focalLength = evalChannel(cam, 'focalLength', t) as number;
  const aperture = evalChannel(cam, 'aperture', t) as number;
  const motionBlur = evalChannel(cam, 'motionBlur', t) as number;
  if (cam.target) rotation = eulerFromLookAt(position, poiPoint(cam, t));
  return { position, rotation, focalLength, aperture, motionBlur };
}

export const hasAnim = (cam: Camera) => cam.keyframes.length > 0;

// Point of Interest: the look-at point at time t.
//  - object target  → object centre (locked, not animatable)
//  - point target   → interpolated POI keyframes, else the static target.point
//  - free camera     → a point derived forward along the (animated) view direction
export function poiPoint(cam: Camera, t: number): Vec3 {
  if (cam.target?.type === 'object') return targetPoint(cam.target);
  const ks = keysOf(cam, 'poi');
  if (ks.length) return evalChannel(cam, 'poi', t) as Vec3;
  if (cam.target?.type === 'point' && cam.target.point) return cam.target.point;
  const p = evaluate(cam, t);
  const pos = new THREE.Vector3(...p.position);
  const e = new THREE.Euler(THREE.MathUtils.degToRad(p.rotation[0]), THREE.MathUtils.degToRad(p.rotation[1]), THREE.MathUtils.degToRad(p.rotation[2]), 'YXZ');
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
  const D = Math.max(2, pos.distanceTo(new THREE.Vector3(0, 0.9, 0)));
  return pos.addScaledVector(dir, D).toArray() as Vec3;
}

// spherical helpers around a pivot (orbit)
export function poseToSpherical(pos: Vec3, pivot: THREE.Vector3) {
  const v = new THREE.Vector3(...pos).sub(pivot);
  const r = v.length();
  const theta = Math.atan2(v.x, v.z);
  const phi = Math.acos(clamp(v.y / r, -1, 1));
  return { r, theta, phi };
}
export function sphericalToPose(s: { r: number; theta: number; phi: number }, pivot: THREE.Vector3): Vec3 {
  return [
    pivot.x + s.r * Math.sin(s.phi) * Math.sin(s.theta),
    pivot.y + s.r * Math.cos(s.phi),
    pivot.z + s.r * Math.sin(s.phi) * Math.cos(s.theta),
  ];
}
