# Director Mode v2 — Guide d'intégration du Lighting

Ce document contient **tout** ce qu'il faut pour ajouter les lumières au Director Mode : les 8 fichiers à créer/remplacer, puis les modifications dans 7 fichiers existants. Applique dans l'ordre, puis lance `npm run dev`.

## Arborescence

```
src/
  types.ts             REMPLACER
  store.ts             editer (5 insertions)
  lib/lightRig.ts      NOUVEAU
  lib/lightEval.ts     NOUVEAU
  lib/lights.ts        NOUVEAU
  three/Scene.tsx      editer
  three/Product.tsx    editer (1 ligne)
  three/SceneLights.tsx    NOUVEAU
  three/LightGizmos.tsx    NOUVEAU
  three/LightMarkers.tsx   NOUVEAU
  ui/LightInspector.tsx    NOUVEAU
  ui/Inspector.tsx     editer
  ui/Outliner.tsx      editer
  ui/Toolbar.tsx       editer
  ui/Timeline.tsx      editer (8 insertions)
```

---

# PARTIE 1 — Fichiers a creer / remplacer


## `src/types.ts` — REMPLACE ton fichier existant

```ts
// Director mode — data model (from the brief)
export type Vec3 = [number, number, number];
// 'intensity' is a LIGHT channel (a plain number), added so lights can reuse the Keyframe unit.
// Cameras never carry intensity keys, so the camera eval path is unaffected.
export type Channel = 'position' | 'rotation' | 'focalLength' | 'poi' | 'aperture' | 'motionBlur' | 'intensity';
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInOutStrong';
export type KeySource = 'manual' | 'preset' | 'interpolation' | 'aiVideo' | 'aiLight';

export interface Keyframe {
  id: string;
  time: number;                 // seconds
  channel: Channel;
  value: Vec3 | number;         // Vec3 for position/rotation/poi, number for focalLength/intensity
  ease: Ease;                   // curve ENTERING this key
  source: KeySource;
  // Bézier tangents for the position channel — offsets (world units) relative to `value`.
  // Undefined = auto (1/3 of the chord to the neighbour) → straight segment.
  tangentIn?: Vec3;             // control handle for the segment ARRIVING at this key
  tangentOut?: Vec3;            // control handle for the segment LEAVING this key
}

export interface Target {
  type: 'object' | 'point';
  objectId?: string;
  point?: Vec3;
}

export interface Camera {
  id: string;
  name: string;
  color: string;                // track / gizmo colour (hex)
  transform: { position: Vec3; rotation: Vec3 };
  optics: { focalLength: number; aperture: number; motionBlurShutter: number; focusPoint?: Vec3 | null };
  target: Target | null;
  keyframes: Keyframe[];
  // On-air time window on the global timeline (multi-camera cuts). Undefined = spans the whole timeline.
  clip?: { start: number; end: number };
}

// ───────────────────────────────────────────────────────────────────────────
// LIGHTS — first-class scene entities, siblings of Camera. A spot/directional
// AIMS exactly like a camera with a POI, so it reuses `Target` + the look-at
// machinery. Animatable channels (position / poi / intensity) reuse `Keyframe`,
// so lights land on the SAME timeline as cameras and inherit undo/redo for free.
// ───────────────────────────────────────────────────────────────────────────
export type LightKind = 'spot' | 'directional' | 'point' | 'ambient' | 'hemisphere';

// Physical occluder projected by a spot (the auto-lighting "gobo").
export interface LightGobo {
  enabled: boolean;
  sharpness: number;            // shadow edge hardness
  size: number;                 // occluder scale multiplier
  rotation: number;             // spin around the light→target axis (radians)
}

export interface Light {
  id: string;
  name: string;
  kind: LightKind;
  color: string;                // hex — for hemisphere this is the SKY colour
  groundColor?: string;         // hemisphere only (ground hemisphere colour)
  intensity: number;
  transform: { position: Vec3; rotation: Vec3 };
  target: Target | null;        // spot/directional aim (look-at) — same type as Camera.target
  // spot / point optics (undefined for ambient/hemisphere)
  angle?: number;               // spot cone half-angle (radians)
  penumbra?: number;            // spot edge softness 0..1
  distance?: number;            // spot/point falloff distance (0 = no limit)
  decay?: number;               // physical falloff exponent
  gobo?: LightGobo;             // spot occluder
  castShadow?: boolean;
  keyframes: Keyframe[];        // animatable: 'position' (Vec3), 'poi' (Vec3), 'intensity' (number)
}

export type Tool = 'select' | 'camera' | 'target' | 'light';

export interface Project {
  cameras: Camera[];
  lights: Light[];              // NEW — scene lights (seeded with the default studio rig)
  activeCameraId: string;
  activeLightId: string;        // NEW — '' when no light is selected
  fps: number;
  timeline: { duration: number; playhead: number; playing: boolean };
  canvas: { width: number; height: number };
}
```


## `src/lib/lightRig.ts` — NOUVEAU fichier

```ts
import type { Light, LightKind } from '../types';
import { uid } from './eval';

// Factory with sensible per-kind defaults. Callers override what they need (position, colour…).
export function makeLight(kind: LightKind, name: string, over: Partial<Light> = {}): Light {
  const base: Light = {
    id: uid(), name, kind,
    color: '#ffffff', intensity: 1,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
    target: null, keyframes: [],
  };
  if (kind === 'spot') {
    base.angle = 0.6; base.penumbra = 0.5; base.distance = 40; base.decay = 1.2; base.castShadow = true;
  }
  if (kind === 'point') { base.distance = 40; base.decay = 1.2; }
  return { ...base, ...over };
}

// The DEFAULT studio rig — a 1:1 port of the hardcoded <Lights> in Scene.tsx, so promoting lights to
// data leaves the out-of-the-box render pixel-identical. Order = z-order in the Outliner list.
//   ambient(0.55,#d8dee6) · hemisphere(#6b7480/#2a2f35,1.0) · key spot · fill / rim / front directionals
// The three directionals keep target=null → three.js aims them at the world origin, exactly as today.
export function makeDefaultLights(): Light[] {
  return [
    makeLight('ambient', 'Ambient', { color: '#d8dee6', intensity: 0.55 }),
    makeLight('hemisphere', 'Sky / Ground', { color: '#6b7480', groundColor: '#2a2f35', intensity: 1.0 }),
    makeLight('spot', 'Key', {
      color: '#fff4e6', intensity: 4.6,
      transform: { position: [6, 9, 6], rotation: [0, 0, 0] },
      angle: 0.85, penumbra: 0.5, distance: 40, decay: 1.2, castShadow: true,
    }),
    makeLight('directional', 'Fill', {
      color: '#9fb4cc', intensity: 0.8, transform: { position: [-7, 4, -3], rotation: [0, 0, 0] },
    }),
    makeLight('directional', 'Rim', {
      color: '#bcd0ff', intensity: 1.0, transform: { position: [-3, 6, -8], rotation: [0, 0, 0] },
    }),
    makeLight('directional', 'Front', {
      color: '#f2f2f6', intensity: 1.0, transform: { position: [5, 4, 9], rotation: [0, 0, 0] },
    }),
  ];
}

// Stable hidden-map key for a light (mirrors the 'cam:'+id convention used for cameras).
export const lightHideKey = (id: string) => 'light:' + id;
```


## `src/lib/lightEval.ts` — NOUVEAU fichier

```ts
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
```


## `src/lib/lights.ts` — NOUVEAU fichier

```ts
import type { Light, LightKind, Channel, Ease, Keyframe, KeySource, Vec3 } from '../types';
import { S } from '../store';
import { makeLight, lightHideKey } from './lightRig';
import { evalLight, lightPoi } from './lightEval';
import { uid, round, clamp } from './eval';

// ── selection ───────────────────────────────────────────────────────────────
export function activeLight(): Light | null {
  const p = S().project;
  return p.lights.find(l => l.id === p.activeLightId) ?? null;
}
export function selectLight(id: string) {
  const st = S();
  st.project.activeLightId = id;
  st.ui.inspect = 'light';           // tell the Inspector to show the light panel
  st.ui.selectedKeyIds = [];
  st.bump();
}

// ── keyframe primitive (mirrors upsertKeyOn, but on a Light) ─────────────────
function lkeys(light: Light, ch: Channel): Keyframe[] {
  return light.keyframes.filter(k => k.channel === ch).sort((a, b) => a.time - b.time);
}
function upsertLightKey(light: Light, ch: Channel, value: Vec3 | number, time: number, source: KeySource = 'manual', ease: Ease = 'linear') {
  const ks = lkeys(light, ch);
  const ex = ks.find(k => Math.abs(k.time - time) < 0.02);
  const v = Array.isArray(value) ? (value.slice() as Vec3) : value;
  if (ex) { ex.value = v; ex.source = source; return ex; }
  const k: Keyframe = { id: uid(), time: round(time, 3), channel: ch, value: v, ease: ks.length ? ease : 'linear', source };
  light.keyframes.push(k); return k;
}
export function lightKeysOf(light: Light, ch: Channel) { return lkeys(light, ch); }

// ── CRUD ─────────────────────────────────────────────────────────────────────
const KIND_LABEL: Record<LightKind, string> = { spot: 'Spot', directional: 'Directional', point: 'Point', ambient: 'Ambient', hemisphere: 'Hemisphere' };

export function addLight(kind: LightKind = 'spot') {
  const st = S(); const p = st.project;
  const n = p.lights.filter(l => l.kind === kind).length + 1;
  const name = `${KIND_LABEL[kind]} ${String(n).padStart(2, '0')}`;
  const over = kind === 'spot'
    ? { color: '#ffffff', intensity: 3, transform: { position: [4, 6, 4] as Vec3, rotation: [0, 0, 0] as Vec3 }, target: { type: 'point' as const, point: [0, 0.9, 0] as Vec3 } }
    : kind === 'directional'
      ? { color: '#ffffff', intensity: 1, transform: { position: [5, 6, 4] as Vec3, rotation: [0, 0, 0] as Vec3 } }
      : {};
  const l = makeLight(kind, name, over);
  p.lights.push(l); p.activeLightId = l.id; st.ui.inspect = 'light';
  st.bump(); st.toast(`${name} added`);
}
export function removeLight(id: string) {
  const st = S(); const p = st.project;
  p.lights = p.lights.filter(l => l.id !== id);
  if (p.activeLightId === id) p.activeLightId = p.lights.length ? p.lights[p.lights.length - 1].id : '';
  delete st.ui.hidden[lightHideKey(id)];
  st.bump();
}
export function duplicateLight(id: string) {
  const st = S(); const p = st.project;
  const idx = p.lights.findIndex(l => l.id === id); if (idx < 0) return;
  const copy: Light = structuredClone(p.lights[idx]);
  copy.id = uid(); copy.name = p.lights[idx].name + ' copy';
  copy.keyframes = copy.keyframes.map(k => ({ ...k, id: uid() }));
  p.lights.splice(idx + 1, 0, copy); p.activeLightId = copy.id; st.ui.inspect = 'light';
  st.bump();
}

// ── static properties (per light, not keyframable) ──────────────────────────
function withLight(fn: (l: Light) => void) { const l = activeLight(); if (!l) return; fn(l); S().bump(); }
export const setLightColor = (hex: string) => withLight(l => { l.color = hex; });
export const setLightGroundColor = (hex: string) => withLight(l => { l.groundColor = hex; });
export const setLightAngle = (rad: number) => withLight(l => { l.angle = clamp(rad, 0.05, Math.PI / 2 - 0.01); });
export const setLightPenumbra = (v: number) => withLight(l => { l.penumbra = clamp(v, 0, 1); });
export const setLightDistance = (v: number) => withLight(l => { l.distance = Math.max(0, v); });
export const setLightCastShadow = (b: boolean) => withLight(l => { l.castShadow = b; });

// ── animatable properties (position / POI / intensity) ──────────────────────
// Each mirrors the camera editors: write a keyframe at the playhead when the channel is animated,
// else set the static base value.
export function editLightIntensity(v: number) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  const iv = Math.max(0, v);
  if (lkeys(l, 'intensity').length) upsertLightKey(l, 'intensity', iv, t, 'manual');
  else l.intensity = iv;
  st.bump();
}
export function editLightPos(i: number, v: number) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  const cur = (evalLight(l, t).position.slice() as Vec3); cur[i] = v;
  if (lkeys(l, 'position').length) upsertLightKey(l, 'position', cur, t, 'manual');
  else l.transform.position = cur;
  st.bump();
}
// Aim: a light with an object target is locked; otherwise ensure a point target and edit/keyframe POI.
export function editLightPoi(i: number, v: number) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  if (l.kind === 'ambient' || l.kind === 'hemisphere' || l.kind === 'point') return; // no aim
  if (l.target?.type === 'object') return;
  const cur = (lightPoi(l, t).slice() as Vec3); cur[i] = v;
  if (!l.target || l.target.type !== 'point') l.target = { type: 'point', point: cur };
  if (lkeys(l, 'poi').length) upsertLightKey(l, 'poi', cur, t, 'manual');
  else if (l.target.type === 'point') l.target.point = cur;
  st.bump();
}

// Whole-vector position commit (from the viewport gizmo): keyframe-aware like editLightPos.
export function commitLightPosition(pos: Vec3) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  if (lkeys(l, 'position').length) upsertLightKey(l, 'position', pos, t, 'manual');
  else l.transform.position = pos;
  st.bump();
}

// Aim the light at a world point (from the POI crosshair). Ensures a point target, keyframe-aware.
export function aimLightAt(point: Vec3) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  if (l.kind === 'ambient' || l.kind === 'hemisphere' || l.kind === 'point') return;
  if (l.target?.type === 'object') return;
  if (!l.target || l.target.type !== 'point') l.target = { type: 'point', point };
  if (lkeys(l, 'poi').length) upsertLightKey(l, 'poi', point, t, 'manual');
  else if (l.target.type === 'point') l.target.point = point;
  st.bump();
}

// KeyDot toggle: add/remove a key at the playhead for an animatable light channel.
export function toggleLightKey(ch: Channel, value: Vec3 | number) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  const ex = lkeys(l, ch).find(k => Math.abs(k.time - t) < 0.02);
  if (ex) { l.keyframes = l.keyframes.filter(k => k.id !== ex.id); st.bump(); return; }
  if (ch === 'poi' && (!l.target || l.target.type !== 'point')) l.target = { type: 'point', point: value as Vec3 };
  upsertLightKey(l, ch, value, t, 'manual'); st.bump();
}

// ── timeline ─────────────────────────────────────────────────────────────────
// Move keys of the ACTIVE light in time (frame-snapped by the caller), clamped to the timeline.
export function moveLightKeysTimes(entries: { id: string; time: number }[]) {
  const st = S(); const l = activeLight(); if (!l) return; const dur = st.project.timeline.duration;
  const m = new Map(entries.map(e => [e.id, e.time]));
  l.keyframes.forEach(k => { if (m.has(k.id)) k.time = clamp(m.get(k.id)!, 0, dur); });
  st.bump();
}
export function removeLightKey(id: string) {
  const st = S(); const l = activeLight(); if (!l) return;
  l.keyframes = l.keyframes.filter(k => k.id !== id); st.bump();
}
```


## `src/three/SceneLights.tsx` — NOUVEAU fichier

```tsx
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { S, useStore } from '../store';
import { evalLight, lightPoi } from '../lib/lightEval';
import { lightHideKey } from '../lib/lightRig';
import type { Light } from '../types';

// One scene light, driven imperatively each frame from the store (position/intensity/aim animate with
// the playhead without re-rendering React). Structural props (kind) come from the store on re-render.
function LightNode({ light }: { light: Light }) {
  const ref = useRef<any>(null);
  // Persistent aim target for spot/directional. Kept in the scene graph via <primitive> so its
  // matrixWorld updates; only assigned as the light's target when the light actually aims.
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const l = S().project.lights.find(x => x.id === light.id);
    const o = ref.current;
    if (!l || !o) return;
    const t = S().project.timeline.playhead;
    o.visible = !S().ui.hidden[lightHideKey(l.id)];
    const pose = evalLight(l, t);
    o.intensity = pose.intensity;
    o.color.set(l.color);
    if (l.kind === 'hemisphere') (o as THREE.HemisphereLight).groundColor.set(l.groundColor || '#000000');
    if (l.kind === 'spot' || l.kind === 'directional' || l.kind === 'point') {
      o.position.set(pose.position[0], pose.position[1], pose.position[2]);
    }
    if (l.kind === 'spot' || l.kind === 'directional') {
      const aim = lightPoi(l, t);
      target.position.set(aim[0], aim[1], aim[2]);
      target.updateMatrixWorld();
      o.target = target;
    }
    if (l.kind === 'spot') {
      const s = o as THREE.SpotLight;
      s.angle = l.angle ?? 0.6; s.penumbra = l.penumbra ?? 0.5;
      s.distance = l.distance ?? 0; s.decay = l.decay ?? 1.2;
      s.castShadow = !!l.castShadow;
    }
  });

  // Initial props (first paint) — useFrame keeps them in sync afterwards.
  const pos = light.transform.position;
  switch (light.kind) {
    case 'ambient':
      return <ambientLight ref={ref} intensity={light.intensity} color={light.color} />;
    case 'hemisphere':
      return <hemisphereLight ref={ref} args={[light.color, light.groundColor || '#000000', light.intensity]} />;
    case 'point':
      return <pointLight ref={ref} position={pos} intensity={light.intensity} color={light.color}
        distance={light.distance ?? 0} decay={light.decay ?? 1.2} />;
    case 'directional':
      return (<>
        <directionalLight ref={ref} position={pos} intensity={light.intensity} color={light.color} />
        <primitive object={target} />
      </>);
    case 'spot':
      return (<>
        <spotLight ref={ref} position={pos} intensity={light.intensity} color={light.color}
          angle={light.angle ?? 0.6} penumbra={light.penumbra ?? 0.5}
          distance={light.distance ?? 40} decay={light.decay ?? 1.2}
          castShadow={!!light.castShadow} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} />
        <primitive object={target} />
      </>);
    default:
      return null;
  }
}

// Renders all store lights. Re-renders only when lights are added/removed/retyped (rev bump);
// per-frame value updates happen inside each LightNode's useFrame.
export default function SceneLights() {
  useStore(s => s.rev);
  const lights = S().project.lights;
  return <>{lights.map(l => <LightNode key={l.id + ':' + l.kind} light={l} />)}</>;
}
```


## `src/three/LightGizmos.tsx` — NOUVEAU fichier

```tsx
import { PivotControls, Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore, S } from '../store';
import { activeLight, commitLightPosition, aimLightAt } from '../lib/lights';
import { evalLight, lightPoi } from '../lib/lightEval';
import { round } from '../lib/eval';
import type { Vec3 } from '../types';

const ONE = new THREE.Vector3(1, 1, 1);

// POI crosshair (mirrors PoiControl, but drives a light's aim). Spot/directional only.
function LightPoi({ poi }: { poi: Vec3 }) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const plane = useMemo(() => new THREE.Plane(), []);
  const rc = useMemo(() => new THREE.Raycaster(), []);
  const move = (clientX: number, clientY: number) => {
    const r = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, camera); const p = new THREE.Vector3();
    if (rc.ray.intersectPlane(plane, p)) aimLightAt([round(p.x, 3), round(p.y, 3), round(p.z, 3)]);
  };
  return (
    <Html position={poi} center zIndexRange={[30, 30]} style={{ pointerEvents: 'auto' }}>
      <div className="poi-handle" title="Light aim — drag to point the light"
        onPointerDown={e => {
          e.stopPropagation();
          const n = camera.getWorldDirection(new THREE.Vector3()).negate();
          plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...poi));
          dragging.current = true; S().setGizmoDragging(true);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => { if (dragging.current) move(e.clientX, e.clientY); }}
        onPointerUp={e => { dragging.current = false; S().setGizmoDragging(false); (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); }} />
    </Html>
  );
}

export default function LightGizmos() {
  const multiview = useStore(s => s.ui.multiview);
  useStore(s => s.rev);
  const st = S();
  const l = st.ui.inspect === 'light' ? activeLight() : null;

  const gizmoDrag = useRef(false);
  const frozen = useRef<THREE.Matrix4 | null>(null);

  // PivotControls can't run under multiview (tracks the default camera only); ambient/hemisphere have
  // no position to move. Hooks above always run — bail on render only.
  if (!l || multiview || l.kind === 'ambient' || l.kind === 'hemisphere') return null;

  const t = st.project.timeline.playhead;
  const pose = evalLight(l, t);
  const live = new THREE.Matrix4().compose(new THREE.Vector3(...pose.position), new THREE.Quaternion(), ONE);
  const matrix = gizmoDrag.current && frozen.current ? frozen.current : live;
  const aims = l.kind === 'spot' || l.kind === 'directional';
  const poi = aims ? lightPoi(l, t) : null;

  const onDragStart = () => { gizmoDrag.current = true; S().setGizmoDragging(true); frozen.current = live.clone(); };
  const onDrag = (_l: THREE.Matrix4, _dl: THREE.Matrix4, w: THREE.Matrix4) => {
    const p = new THREE.Vector3(); w.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
    commitLightPosition([round(p.x, 3), round(p.y, 3), round(p.z, 3)]);
  };
  const onDragEnd = () => { gizmoDrag.current = false; frozen.current = null; S().setGizmoDragging(false); };

  return (
    <>
      <PivotControls matrix={matrix} autoTransform fixed scale={45} lineWidth={2} depthTest={false}
        disableScaling disableRotations activeAxes={[true, true, true]}
        onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}>
        {/* Small emissive marker tinted with the light's colour so the selected light reads clearly. */}
        <mesh userData={{ gizmo: { kind: 'light' } }}>
          <sphereGeometry args={[0.11, 20, 20]} />
          <meshStandardMaterial color={l.color} emissive={l.color} emissiveIntensity={0.9} roughness={0.4} metalness={0.2} />
        </mesh>
      </PivotControls>
      {poi && (<>
        <Line points={[pose.position, poi]} color={l.color} lineWidth={1.4} transparent opacity={0.5} dashed dashSize={0.12} gapSize={0.08} />
        <LightPoi poi={poi} />
      </>)}
    </>
  );
}
```


## `src/three/LightMarkers.tsx` — NOUVEAU fichier

```tsx
import { useStore, S } from '../store';
import { selectLight } from '../lib/lights';
import { evalLight } from '../lib/lightEval';
import { lightHideKey } from '../lib/lightRig';

// Clickable markers for every positional light that isn't the selected one (that one shows the gizmo).
// Ambient/hemisphere have no position, so they're skipped. Click selects → LightInspector + gizmo.
export default function LightMarkers() {
  useStore(s => s.rev);
  const st = S(); const t = st.project.timeline.playhead;
  const activeId = st.ui.inspect === 'light' ? st.project.activeLightId : '';
  return (
    <>
      {st.project.lights.map(l => {
        if (l.kind === 'ambient' || l.kind === 'hemisphere') return null;
        if (l.id === activeId) return null;
        if (st.ui.hidden[lightHideKey(l.id)]) return null;
        const p = evalLight(l, t).position;
        return (
          <mesh key={l.id} position={p} userData={{ gizmo: { kind: 'light-marker', id: l.id } }}
            onPointerDown={e => { e.stopPropagation(); selectLight(l.id); }}>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshBasicMaterial color={l.color} />
          </mesh>
        );
      })}
    </>
  );
}
```


## `src/ui/LightInspector.tsx` — NOUVEAU fichier

```tsx
import { S } from '../store';
import { useRev } from './bits';
import { evalLight, lightPoi } from '../lib/lightEval';
import {
  activeLight, lightKeysOf, removeLight, duplicateLight,
  setLightColor, setLightGroundColor, setLightAngle, setLightPenumbra, setLightCastShadow,
  editLightIntensity, editLightPos, editLightPoi, toggleLightKey,
} from '../lib/lights';
import { round } from '../lib/eval';
import type { Channel, Vec3 } from '../types';

// Keyframe marker for an animatable LIGHT channel (mirrors Inspector's KeyDot, but light-aware).
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
  const positional = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'point';
  const aims = l.kind === 'spot' || l.kind === 'directional';

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
        <div className="row"><span className="row-lead"><span className="kf-spacer" /><label>Type</label></span><span className="val">{l.kind}</span></div>
      </div>

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
        <Slider label="Intensity" ch="intensity" value={pose.intensity} min={0} max={l.kind === 'spot' ? 20 : 4} step={0.1} onChange={editLightIntensity} />
        {isSpot && <Slider label="Cone" value={Math.round((l.angle ?? 0.6) * 180 / Math.PI)} min={5} max={89} step={1} unit="°"
          onChange={deg => setLightAngle(deg * Math.PI / 180)} />}
        {isSpot && <Slider label="Softness" value={l.penumbra ?? 0.5} min={0} max={1} step={0.05} onChange={setLightPenumbra} />}
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
          {l.target?.type === 'object' && <div className="hint" style={{ margin: '2px 0' }}>⚿ Aim locked to target object</div>}
        </div>
      )}
    </>
  );
}
```


---

# PARTIE 2 — Modifications des fichiers existants

Ces fichiers existent déjà : tu insères juste les bouts ci-dessous (aucun ne casse le code caméra).

## `src/store.ts` (5 insertions)

**1.** En haut, avec les autres imports :
```ts
import { makeDefaultLights } from './lib/lightRig';
```

**2.** Dans le `project` initial (dans le `create(...)`), ajoute `lights` et `activeLightId` :
```ts
  const project: Project = {
    cameras: [initial], lights: makeDefaultLights(),
    activeCameraId: initial.id, activeLightId: '',
    fps: 30,
    timeline: { duration: 5, playhead: 0, playing: false },
    canvas: { width: 1920, height: 1080 },
  };
```

**3.** Dans `interface UI { … }`, ajoute une ligne :
```ts
  inspect: 'camera' | 'light';
```

**4.** Dans l'objet `ui: { … }` initial (la grande ligne qui commence par `ui: { tool: 'select', …`), ajoute :
```ts
  inspect: 'camera',
```

**5.** Dans l'action `selectCamera`, ajoute `get().ui.inspect = 'camera';` :
```ts
    selectCamera: id => { get().project.activeCameraId = id; get().ui.inspect = 'camera'; get().ui.selectedKeyIds = []; get().ui.targetSelected = false; bump(); },
```

## `src/three/Scene.tsx`

**1.** Supprime toute la fonction `function Lights() { … }` (le bloc entier ambient/hemisphere/spot/directional).

**2.** Ajoute les imports en haut :
```ts
import SceneLights from './SceneLights';
import LightMarkers from './LightMarkers';
import LightGizmos from './LightGizmos';
```

**3.** Dans le rendu, remplace `<Lights />` par `<SceneLights />`.

**4.** Toujours dans le rendu, à côté de tes lignes `<CameraMarkers />` / `<PoiControl />`, ajoute :
```tsx
      {mode === 'scene' && !multiview && <LightMarkers />}
      {mode === 'scene' && !multiview && <LightGizmos />}
```

## `src/three/Product.tsx` (1 ligne)

Remplace la constante d'URL de l'asset par le nouveau sac :
```ts
const URL = '/asset/Outdoor_Bag_Blue_orange_V03.glb';
```
(Dépose le `.glb` optimisé 1K dans `public/asset/`.)

## `src/ui/Inspector.tsx`

**1.** Ajoute les imports :
```ts
import LightInspector from './LightInspector';
import { activeLight } from '../lib/lights';
```

**2.** Supprime le bloc `if (!hasCam) { return ( … ); }`.

**3.** Dans le `return` final, juste après `<Outliner />`, insère la bascule et enveloppe les sections caméra existantes dans la branche `else` :
```tsx
      <Outliner />

      {st.ui.inspect === 'light' && activeLight() ? <LightInspector />
        : st.project.cameras.length === 0 ? (
          <div className="sect"><p className="hint" style={{ margin: 0 }}>No camera in the scene — add one above to compose a shot.</p></div>
        ) : (<>
          {/* ↓↓↓ tes sections caméra existantes, inchangées ↓↓↓ */}
          {selKeys.length > 0 ? <KeyInspector ks={selKeys} cam={cam} /> : <MoveCurve cam={cam} />}
          {/* … Transform, Optics … */}
          <CameraMoves cam={cam} />
        </>)}
```
Autrement dit : tu wrappes tout ce qui va de `{selKeys.length > 0 …}` jusqu'à `<CameraMoves cam={cam} />` dans le `(<> … </>)` de la branche `else`.

## `src/ui/Outliner.tsx`

**1.** Ajoute les imports :
```ts
import { selectLight, addLight, removeLight } from '../lib/lights';
import { lightHideKey } from '../lib/lightRig';
```

**2.** Ajoute cette petite icône ampoule près de `TargetBadge` :
```tsx
const Bulb = () => (
  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2.5a4.2 4.2 0 0 0-2.4 7.6c.5.4.8.9.8 1.5h3.2c0-.6.3-1.1.8-1.5A4.2 4.2 0 0 0 9 2.5Z" /><path d="M7.4 13.4h3.2M7.8 15h2.4" />
  </svg>
);
```

**3.** Juste après le bouton `+ New camera`, insère la section Lights :
```tsx
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
        <button className="btn-sm btn-full" style={{ marginTop: 6 }} onClick={() => addLight('spot')}>+ New light</button>
```

## `src/ui/Toolbar.tsx`

Ajoute un bouton d'outil « light » après le bouton Target :
```tsx
      <button className={'tool' + (tool === 'light' ? ' active' : '')} title="Light (L)"
        onClick={() => S().setTool('light')}>
        <svg viewBox="0 0 18 18" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2.5a4.2 4.2 0 0 0-2.4 7.6c.5.4.8.9.8 1.5h3.2c0-.6.3-1.1.8-1.5A4.2 4.2 0 0 0 9 2.5Z"/><path d="M7.4 13.4h3.2M7.8 15h2.4"/></svg>
      </button>
```

## `src/ui/Timeline.tsx` (8 insertions additives — piste timeline des lumières)

**A) Déclarations**

1. Import (en haut) :
```ts
import { activeLight, lightKeysOf, moveLightKeysTimes, removeLightKey } from '../lib/lights';
```
2. Dans le type du ref `drag`, ajoute `'lkey'` à l'union `mode` :
```ts
mode: 'scrub' | 'key' | 'marquee' | 'clip' | 'clip-move' | 'lkey';
```

**B) Layout — juste AVANT la ligne `const H = yCur + 4;`**, insère :
```ts
  // Selected light → an extra track (Position / Aim / Intensity) below the cameras.
  const selLight = st.ui.inspect === 'light' ? activeLight() : null;
  let lightHeaderY = 0;
  const lightRows: { def: RowDef; ry: number }[] = [];
  if (selLight) {
    lightHeaderY = yCur; yCur += TRACK_H;
    const defs: RowDef[] = [
      { label: 'Position', ch: 'position' },
      ...((selLight.kind === 'spot' || selLight.kind === 'directional')
        ? [{ label: 'Aim (POI)', ch: 'poi' as Channel, lock: selLight.target?.type === 'object' }] : []),
      { label: 'Intensity', ch: 'intensity' },
    ];
    defs.forEach(def => { const ry = yCur; yCur += ROW_H; lightRows.push({ def, ry }); });
    yCur += GAP;
  }
```

**C) Handlers**

3. Dans `onDown`, juste après le bloc `if (clipEdge) { … return; }`, insère :
```ts
    const lkey = el.getAttribute('data-lkey');
    if (lkey) {
      try { (e.currentTarget as SVGElement).setPointerCapture(e.pointerId); } catch { /* best-effort */ }
      const kf = activeLight()?.keyframes.find(k => k.id === lkey);
      if (kf) drag.current = { mode: 'lkey', keyId: lkey, grabbedBase: kf.time, pointerId: e.pointerId };
      return;
    }
```
4. Dans `onMove`, ajoute une branche (après la branche `'key'`) :
```ts
    else if (drag.current.mode === 'lkey') {
      moveLightKeysTimes([{ id: drag.current.keyId!, time: snap(timeFromX(px)) }]);
    }
```
5. Remplace `onDbl` par :
```ts
  const onDbl = (e: React.MouseEvent) => {
    const id = (e.target as SVGElement).getAttribute('data-key'); if (id) { S().removeKey(id); return; }
    const lid = (e.target as SVGElement).getAttribute('data-lkey'); if (lid) removeLightKey(lid);
  };
```

**D) Rendu**

6. À côté du helper `diamond`, ajoute :
```tsx
  const lightDiamond = (k: Keyframe, cx: number, cy: number, color: string) => (
    <rect key={k.id} data-lkey={k.id} x={cx - 5} y={cy - 5} width={10} height={10}
      transform={`rotate(45 ${cx} ${cy})`} fill={color} stroke="#0008" strokeWidth={1} style={{ cursor: 'grab' }} />
  );
```
7. Dans le SVG, juste après le bloc `{layout.map(...)}` (les caméras) et avant `{marquee && …}`, insère :
```tsx
          {selLight && (
            <g>
              <rect x={LEFT} y={lightHeaderY} width={contentW - LEFT - RIGHT} height={TRACK_H} rx={6} fill={selLight.color} fillOpacity={0.18} pointerEvents="none" />
              <circle cx={LEFT + 12} cy={lightHeaderY + TRACK_H / 2} r={5} fill={selLight.color} pointerEvents="none" />
              <text x={LEFT + 24} y={lightHeaderY + TRACK_H / 2 + 4} fill="#e6e6ea" fontSize={12} pointerEvents="none">{selLight.name} · light</text>
              {lightRows.map(({ def, ry }) => {
                const rcy = ry + ROW_H / 2;
                return (
                  <g key={def.label}>
                    <text x={LEFT + 32} y={rcy + 3} fill={def.lock ? '#6b6270' : '#9aa3ab'} fontSize={10}>{def.label}{def.lock ? ' ⚿' : ''}</text>
                    <line x1={LEFT} y1={ry + ROW_H - 1} x2={contentW - RIGHT} y2={ry + ROW_H - 1} stroke="#2a2130" />
                    {lightKeysOf(selLight, def.ch).map(k => lightDiamond(k, x(k.time), rcy, selLight.color))}
                  </g>
                );
              })}
            </g>
          )}
```

---

# PARTIE 3 — Lancer

```bash
npm install
npm run dev
```

Tu devrais voir : le sac chargé et cadré, un éclairage identique à avant, et dans le panneau de droite une section **Lights** (6 lumières). Clique une lumière → l'Inspector montre ses réglages ; en vue Scene un gizmo apparaît pour la déplacer/viser ; ses keyframes s'affichent dans la timeline.

## Si ça ne compile pas

- Erreur d'import manquant → vérifie que les 3 fichiers de `src/lib/` et les 3 de `src/three/` sont bien créés aux bons chemins.
- `Property 'inspect' does not exist` → l'insertion n°3/4 de `store.ts` (dans `interface UI` + l'objet `ui:`) n'a pas été faite.
- `Property 'lights' does not exist` → l'insertion n°2 de `store.ts` (le `project` initial) manque.
