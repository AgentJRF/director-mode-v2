import type { Light, Channel, Keyframe, Vec3 } from '../types';
import { EASES, bezier3, bezierArcParam, handleOffset, clamp, lerp, eulerFromLookAt, targetPoint } from './eval';

// Light keyframes for one channel, time-sorted. Mirrors keysOf() but over a Light (not a Camera).
function lkeys(light: Light, ch: Channel): Keyframe[] {
  return light.keyframes.filter(k => k.channel === ch).sort((a, b) => a.time - b.time);
}
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cloneVal = (v: Vec3 | number) => (Array.isArray(v) ? (v.slice() as Vec3) : v);

// Evaluate one animatable light channel at t. Static base when there are no keys.
//  - 'position'  → cubic Bézier + arc-length reparam (same speed model as the camera spline)
//  - 'poi'       → linear (aim point; look-at derives the rotation)
//  - 'intensity' → linear
function evalLightChannel(light: Light, ch: Channel, t: number): Vec3 | number {
  const ks = lkeys(light, ch);
  const base: Vec3 | number =
    ch === 'intensity' ? light.intensity
    : ch === 'poi' ? (light.target?.type === 'point' && light.target.point ? light.target.point : [0, 0, 0])
    : light.transform.position;
  if (ks.length === 0) return cloneVal(base);
  if (t <= ks[0].time) return cloneVal(ks[0].value);
  if (t >= ks[ks.length - 1].time) return cloneVal(ks[ks.length - 1].value);
  let i = 0; while (i < ks.length - 1 && ks[i + 1].time < t) i++;
  const a = ks[i], b = ks[i + 1];
  const raw = clamp((t - a.time) / (b.time - a.time || 1), 0, 1);
  const e = (EASES[b.ease] || EASES.linear)(raw);
  if (ch === 'intensity') return lerp(a.value as number, b.value as number, e);
  const av = a.value as Vec3, bv = b.value as Vec3;
  if (ch === 'position') {
    const p1 = addv(av, handleOffset(ks, i, 'out'));
    const p2 = addv(bv, handleOffset(ks, i + 1, 'in'));
    const bt = bezierArcParam(av, p1, p2, bv, e); // ease = fraction of arc length → true speed control
    return bezier3(av, p1, p2, bv, bt);
  }
  return [lerp(av[0], bv[0], e), lerp(av[1], bv[1], e), lerp(av[2], bv[2], e)];
}

// The aim point (POI) of a spot/directional at time t.
//  object target → object centre (locked) · point target → POI keys or static point · else → origin
// (origin matches three.js' default light target, so the seeded rig lights exactly as the old hardcode).
export function lightPoi(light: Light, t: number): Vec3 {
  if (light.target?.type === 'object') return targetPoint(light.target);
  if (lkeys(light, 'poi').length) return evalLightChannel(light, 'poi', t) as Vec3;
  if (light.target?.type === 'point' && light.target.point) return light.target.point;
  return [0, 0, 0];
}

export interface LightPose { position: Vec3; rotation: Vec3; intensity: number; }

// Full evaluated pose of a light at t. Rotation is derived by look-at whenever the light aims
// (has a target or POI keys); otherwise its static transform.rotation is kept.
export function evalLight(light: Light, t: number): LightPose {
  const position = evalLightChannel(light, 'position', t) as Vec3;
  const intensity = evalLightChannel(light, 'intensity', t) as number;
  let rotation = light.transform.rotation;
  if (light.target || lkeys(light, 'poi').length) rotation = eulerFromLookAt(position, lightPoi(light, t));
  return { position, rotation, intensity };
}

export const lightHasAnim = (light: Light) => light.keyframes.length > 0;