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
const KIND_LABEL: Record<LightKind, string> = { spot: 'Spot', directional: 'Directional', point: 'Point', ambient: 'Ambient', hemisphere: 'Dome', area: 'Area' };
// Friendly type name for the UI (kind → label). Mirrors KIND_LABEL, exported for the inspector.
export const lightKindLabel = (kind: LightKind) => KIND_LABEL[kind];

export function addLight(kind: LightKind = 'spot') {
  const st = S(); const p = st.project;
  const n = p.lights.filter(l => l.kind === kind).length + 1;
  const name = `${KIND_LABEL[kind]} ${String(n).padStart(2, '0')}`;
  // New lights are born FREE (no object lock, no forced aim at the asset). They aim at the world
  // origin by default; use the Target ("lock") tool to lock a light onto an asset.
  const over =
    kind === 'spot'
      ? { color: '#ffffff', intensity: 3, transform: { position: [4, 6, 4] as Vec3, rotation: [0, 0, 0] as Vec3 }, distance: 20 }
      : kind === 'directional'
        ? { color: '#ffffff', intensity: 1, transform: { position: [5, 6, 4] as Vec3, rotation: [0, 0, 0] as Vec3 } }
        : kind === 'area'
          ? { color: '#ffffff', intensity: 5, transform: { position: [3, 4, 4] as Vec3, rotation: [0, 0, 0] as Vec3 }, width: 3, height: 3 }
          : kind === 'point'
            ? { color: '#ffffff', intensity: 3, transform: { position: [3, 4, 3] as Vec3, rotation: [0, 0, 0] as Vec3 }, distance: 15 }
            : kind === 'hemisphere'
              ? { color: '#aec6ff', groundColor: '#3a3020', intensity: 1 }
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
export const setLightWidth = (v: number) => withLight(l => { l.width = Math.max(0.05, v); });
export const setLightHeight = (v: number) => withLight(l => { l.height = Math.max(0.05, v); });
export const setLightCastShadow = (b: boolean) => withLight(l => { l.castShadow = b; });

// ── animatable properties (position / POI / intensity) ──────────────────────
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
export function editLightPoi(i: number, v: number) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  if (l.kind === 'ambient' || l.kind === 'hemisphere' || l.kind === 'point') return;
  if (l.target?.type === 'object') return;
  const cur = (lightPoi(l, t).slice() as Vec3); cur[i] = v;
  if (!l.target || l.target.type !== 'point') l.target = { type: 'point', point: cur };
  if (lkeys(l, 'poi').length) upsertLightKey(l, 'poi', cur, t, 'manual');
  else if (l.target.type === 'point') l.target.point = cur;
  st.bump();
}

export function toggleLightKey(ch: Channel, value: Vec3 | number) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  const ex = lkeys(l, ch).find(k => Math.abs(k.time - t) < 0.02);
  if (ex) { l.keyframes = l.keyframes.filter(k => k.id !== ex.id); st.bump(); return; }
  if (ch === 'poi' && (!l.target || l.target.type !== 'point')) l.target = { type: 'point', point: value as Vec3 };
  upsertLightKey(l, ch, value, t, 'manual'); st.bump();
}

// Whole-vector position commit (from the viewport gizmo): keyframe-aware like editLightPos.
export function commitLightPosition(pos: Vec3) {
  const st = S(); const l = activeLight(); if (!l) return; const t = st.project.timeline.playhead;
  if (lkeys(l, 'position').length) upsertLightKey(l, 'position', pos, t, 'manual');
  else l.transform.position = pos;
  st.bump();
}

// Lock the active light's aim onto a scene object (from the Target "lock" tool). Object aim overrides
// POI keys (the light follows the object), mirroring the camera's object target.
export function setLightTargetObject(objectId: string) {
  const st = S(); const l = activeLight(); if (!l) return;
  if (l.kind === 'ambient' || l.kind === 'hemisphere' || l.kind === 'point') { st.toast('This light has no aim'); return; }
  l.target = { type: 'object', objectId };
  l.keyframes = l.keyframes.filter(k => k.channel !== 'poi'); // POI is now driven by the object
  st.bump();
}
// Unlock: drop the object target, keeping the light free (aims at world origin until re-aimed).
export function clearLightTarget() {
  const st = S(); const l = activeLight(); if (!l) return;
  l.target = null; st.bump();
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

// ── timeline ─────────────────────────────────────────────────────────────────
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