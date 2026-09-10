import * as THREE from 'three';
import type { Camera, Channel, Ease, Keyframe, Vec3 } from '../types';
import { evaluate, eulerFromLookAt, keysOf, poseToSpherical, sphericalToPose, clamp, lerp, evalChannel, targetPoint, OBJECT_FRAME } from './eval';
import { S, PIVOT, upsertKeyOn } from '../store';

export interface PresetOpts { duration?: number; amplitude?: number; ease?: Ease; dir?: 1 | -1; }

export function applyPreset(kind: string, opts: PresetOpts = {}) {
  const st = S(); const cam = st.active();
  const tl = st.project.timeline;
  const t0 = tl.playhead; const dur = opts.duration ?? 2.5; const t1 = Math.min(t0 + dur, tl.duration);
  const ease = opts.ease ?? 'linear'; const amp = opts.amplitude ?? 1; const dir = opts.dir ?? 1;
  const base = evaluate(cam, t0);
  // Movement presets pivot around the camera's TARGET (fallback: global pivot).
  const pivot = cam.target ? new THREE.Vector3(...targetPoint(cam.target)) : PIVOT;
  const sph = poseToSpherical(base.position, pivot);
  sph.theta = 0; // every preset STARTS facing the object (front, +Z), keeping the current elevation
  // Frame at a comfortable distance for an object target (head-on shows the widest profile), so the
  // departure isn't zoomed into the model. Never move closer than the current distance.
  const frameDist = cam.target?.type === 'object' && cam.target.objectId ? OBJECT_FRAME[cam.target.objectId] : undefined;
  if (frameDist) sph.r = Math.max(sph.r, frameDist);
  const startPos = sphericalToPose(sph, pivot);
  const setKey = (ch: Channel, val: Vec3 | number, t: number, ez: Ease) => upsertKeyOn(cam, ch, val, t, 'preset', ez);
  cam.keyframes = []; // a preset REPLACES the current move (presets don't stack)
  cam.transform.position = startPos; // reposition to face the object (also covers presets that don't animate position)

  switch (kind) {
    case 'dolly': {
      // dir = +1 push in (toward the target), -1 push out
      const vdir = new THREE.Vector3(...startPos).sub(pivot).normalize();
      const p1 = new THREE.Vector3(...startPos).addScaledVector(vdir, -2.4 * amp * dir).toArray() as Vec3;
      setKey('position', startPos, t0, 'linear'); setKey('position', p1, t1, ease); break;
    }
    case 'orbit': case 'arc': {
      const sweep = (kind === 'orbit' ? 2 * Math.PI : Math.PI / 2) * amp * dir; // orbit = tour complet, arc = ¼
      // True circular arc: split into ≤90° segments (a single Bézier is only accurate up to ~90°),
      // each with circular tangents (handle length = R·4/3·tan(segAngle/4)) so the path is a real circle.
      const R = Math.hypot(startPos[0] - pivot.x, startPos[2] - pivot.z) || 1;
      const nSeg = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
      const segAngle = Math.abs(sweep) / nSeg;
      const L = R * (4 / 3) * Math.tan(segAngle / 4);
      let lastPos = startPos;
      for (let i = 0; i <= nSeg; i++) {
        const frac = i / nSeg;
        const pos = i === 0 ? startPos : sphericalToPose({ ...sph, theta: sph.theta - sweep * frac }, pivot);
        const k = setKey('position', pos, lerp(t0, t1, frac), i ? ease : 'linear') as Keyframe;
        const radial = new THREE.Vector3(pos[0] - pivot.x, 0, pos[2] - pivot.z).normalize();
        const tang = new THREE.Vector3(radial.z, 0, -radial.x).multiplyScalar(-Math.sign(sweep) * L); // circle tangent, travel dir
        if (i < nSeg) k.tangentOut = [tang.x, 0, tang.z];
        if (i > 0) k.tangentIn = [-tang.x, 0, -tang.z];
        lastPos = pos;
      }
      if (!cam.target) {
        setKey('rotation', eulerFromLookAt(startPos, pivot.toArray() as Vec3), t0, 'linear');
        setKey('rotation', eulerFromLookAt(lastPos, pivot.toArray() as Vec3), t1, ease);
      }
      break;
    }
    case 'crane': {
      // dir = +1 up, -1 down: change elevation (phi) around the target, keep look-at
      const end = { ...sph, phi: clamp(sph.phi - 0.5 * amp * dir, 0.12, Math.PI - 0.12) };
      setKey('position', startPos, t0, 'linear');
      setKey('position', sphericalToPose(end, pivot), t1, ease);
      if (!cam.target) {
        setKey('rotation', eulerFromLookAt(startPos, pivot.toArray() as Vec3), t0, 'linear');
        setKey('rotation', eulerFromLookAt(sphericalToPose(end, pivot), pivot.toArray() as Vec3), t1, ease);
      }
      break;
    }
    case 'pan': { const r0 = base.rotation.slice() as Vec3; const r1 = r0.slice() as Vec3; r1[1] -= 28 * amp; setKey('rotation', r0, t0, 'linear'); setKey('rotation', r1, t1, ease); break; }
    case 'tilt': { const r0 = base.rotation.slice() as Vec3; const r1 = r0.slice() as Vec3; r1[0] += 20 * amp; setKey('rotation', r0, t0, 'linear'); setKey('rotation', r1, t1, ease); break; }
    case 'dollyZoom': {
      // Vertigo / dolly-zoom: the subject stays the SAME size in frame while the perspective warps.
      // Apparent size ∝ focal / distance, so keeping it constant means focal ∝ distance.
      // dir = +1 → dolly IN + zoom OUT (background expands); dir = -1 → dolly OUT + zoom IN.
      const radial = new THREE.Vector3(...startPos).sub(pivot);
      const d0 = radial.length() || 1;
      const vdir = radial.clone().normalize();
      const d1 = clamp(d0 - 2.2 * amp * dir, 1.4, 30);          // +dir moves toward the target
      const p1 = pivot.clone().addScaledVector(vdir, d1).toArray() as Vec3;
      const f0 = cam.optics.focalLength;
      const f1 = clamp(f0 * (d1 / d0), 14, 200);                 // keep subject size: focal tracks distance
      setKey('position', startPos, t0, 'linear'); setKey('position', p1, t1, ease);
      setKey('focalLength', f0, t0, 'linear'); setKey('focalLength', f1, t1, ease);
      break;
    }
  }
  const n = cam.keyframes.length;
  st.setPlayhead(t0); st.bump();
  st.toast(`Preset "${kind}" applied — ${n} editable keys`);
}

// --- AI motion match (video) ------------------------------------------------
// A global camera gesture as a start→end framing (spherical az/el/dist + focal/aperture), returned by
// /api/match-motion and turned here into a few EDITABLE carrier keyframes (never one per frame).
export interface MotionStep { az: number; el: number; dist: number; focal: number; aperture: number }
// Exact baked animation (verbatim keyframes) — a hand-authored move captured from the app.
export interface MotionKey { t: number; pos: Vec3; ease: Ease; tOut?: Vec3; tIn?: Vec3 }
export interface MotionExact { target: Vec3 | null; focal: number; aperture: number; duration: number; keys: MotionKey[] }
export interface MotionSpec { gesture: string; duration: number; ease: Ease; start: MotionStep; end: MotionStep; exact?: MotionExact }

// Same spherical mapping as AIImageModal.applyForm / MatchPreview: distance is a ×2 factor, az/el degrees.
export function stepToPose(s: MotionStep): Vec3 {
  const r = clamp(s.dist * 2, 1.6, 14);
  const theta = s.az * Math.PI / 180;
  const phi = clamp((90 - s.el) * Math.PI / 180, 0.12, Math.PI - 0.12);
  return sphericalToPose({ r, theta, phi }, PIVOT);
}

// Bézier control points for a natural arc from p0 → p1 that sweeps AROUND the product (PIVOT), rather
// than a straight line. Tangents are ⟂ to the radius at each end (circular-arc feel, like the orbit
// preset), with handle length from the angle subtended at the pivot. Shared by applyMotionSpec (sets
// key tangents) and the review preview (samples the same curve) so they always agree.
export function arcControls(p0: Vec3, p1: Vec3): { c1: Vec3; c2: Vec3 } {
  const rA = new THREE.Vector3(...p0).sub(PIVOT);
  const rB = new THREE.Vector3(...p1).sub(PIVOT);
  const axis = new THREE.Vector3().crossVectors(rA, rB);
  if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);   // colinear endpoints → fall back to a vertical bow
  axis.normalize();
  const ang = Math.max(rA.angleTo(rB), 0.05);
  const Rm = (rA.length() + rB.length()) / 2;
  const L = Rm * (4 / 3) * Math.tan(ang / 4);        // handle length for a ~circular arc
  const tanA = new THREE.Vector3().crossVectors(axis, rA).normalize().multiplyScalar(L); // travel dir at start
  const tanB = new THREE.Vector3().crossVectors(axis, rB).normalize().multiplyScalar(L); // travel dir at end
  const c1 = new THREE.Vector3(...p0).add(tanA);
  const c2 = new THREE.Vector3(...p1).sub(tanB);
  return { c1: [c1.x, c1.y, c1.z], c2: [c2.x, c2.y, c2.z] };
}

// Apply a hand-authored move verbatim: exact position keys (with Bézier tangents), point target, optics.
function applyExactMotion(spec: MotionSpec, ex: MotionExact) {
  const st = S(); const cam = st.active();
  if (ex.duration > st.project.timeline.duration) st.setDuration(ex.duration); // make room for the whole move
  cam.keyframes = [];
  cam.target = ex.target ? { type: 'point', point: [...ex.target] as Vec3 } : null; // aim (rotation derived)
  cam.transform.position = [...ex.keys[0].pos] as Vec3;
  ex.keys.forEach((k, i) => {
    const kk = upsertKeyOn(cam, 'position', k.pos, k.t, 'aiVideo', i ? k.ease : 'linear') as Keyframe;
    if (k.tOut) kk.tangentOut = [...k.tOut] as Vec3;
    if (k.tIn) kk.tangentIn = [...k.tIn] as Vec3;
  });
  cam.optics.focalLength = ex.focal; cam.optics.aperture = ex.aperture; cam.optics.focusPoint = null;
  st.setPlayhead(0); st.bump();
  st.toast(`AI motion "${spec.gesture}" applied`);
}

export function applyMotionSpec(spec: MotionSpec) {
  if (spec.exact) { applyExactMotion(spec, spec.exact); return; } // hand-authored move wins
  const st = S(); const cam = st.active(); const tl = st.project.timeline;
  const t0 = tl.playhead; const t1 = Math.min(t0 + spec.duration, tl.duration);
  const ease = spec.ease ?? 'easeInOut';
  const p0 = stepToPose(spec.start), p1 = stepToPose(spec.end);
  const { c1, c2 } = arcControls(p0, p1);
  cam.keyframes = [];   // an AI match REPLACES the current move (like a preset)
  cam.target = { type: 'point', point: PIVOT.toArray() as Vec3 }; // aim stays on the product through the arc
  cam.transform.position = p0;
  // Two position keys carrying Bézier tangents → a single smooth, natural arc (no per-frame keys).
  const kA = upsertKeyOn(cam, 'position', p0, t0, 'aiVideo', 'linear') as Keyframe;
  const kB = upsertKeyOn(cam, 'position', p1, t1, 'aiVideo', ease) as Keyframe;
  kA.tangentOut = [c1[0] - p0[0], c1[1] - p0[1], c1[2] - p0[2]];
  kB.tangentIn = [c2[0] - p1[0], c2[1] - p1[1], c2[2] - p1[2]];
  // Optics are constant across this gesture — set them statically (no needless keys).
  cam.optics.focalLength = spec.start.focal; cam.optics.aperture = spec.start.aperture; cam.optics.focusPoint = null;
  st.setPlayhead(t0); st.bump();
  st.toast(`AI motion "${spec.gesture}" applied`);
}

export function applyCurve(ease: Ease) {
  const cam = S().active();
  cam.keyframes.forEach(k => { const first = keysOf(cam, k.channel)[0]; if (k !== first) k.ease = ease; });
  S().toast('Curve "' + ease + '" applied (motion unchanged)'); S().bump();
}

export function fuseAB() {
  const st = S(); const cam = st.active(); const { poseA, poseB } = st.ui;
  if (!poseA || !poseB) { st.toast('Capture A and B first'); return; }
  cam.keyframes = cam.keyframes.filter(k => !['position', 'rotation', 'focalLength', 'poi'].includes(k.channel));
  const t0 = 0, t1 = st.project.timeline.duration;
  upsertKeyOn(cam, 'position', poseA.position, t0, 'interpolation', 'linear');
  upsertKeyOn(cam, 'position', poseB.position, t1, 'interpolation', 'easeInOut');
  if (!cam.target) {
    upsertKeyOn(cam, 'rotation', poseA.rotation, t0, 'interpolation', 'linear');
    upsertKeyOn(cam, 'rotation', poseB.rotation, t1, 'interpolation', 'easeInOut');
  }
  upsertKeyOn(cam, 'focalLength', poseA.focal, t0, 'interpolation', 'linear');
  upsertKeyOn(cam, 'focalLength', poseB.focal, t1, 'interpolation', 'easeInOut');
  st.setPoseAB('A', null); st.setPoseAB('B', null); st.setModal(null);
  st.toast('A→B merged: 1 camera, 2 keys per channel — editable spline'); st.bump();
}

export function resampleChannel(cam: Camera, ch: Channel, n: number) {
  const ks = keysOf(cam, ch); if (ks.length < 2) return;
  const t0 = ks[0].time, t1 = ks[ks.length - 1].time, ease = ks[ks.length - 1].ease;
  const samples: { t: number; v: Vec3 | number }[] = [];
  for (let i = 0; i < n; i++) { const t = lerp(t0, t1, i / (n - 1)); samples.push({ t, v: evalChannel(cam, ch, t) }); }
  cam.keyframes = cam.keyframes.filter(k => k.channel !== ch);
  samples.forEach((s, i) => upsertKeyOn(cam, ch, s.v, s.t, 'aiVideo', i ? ease : 'linear'));
}
