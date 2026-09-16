import { PivotControls, Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore, S } from '../store';
import { activeLight, commitLightPosition, aimLightAt, lightKeysOf, setLightKeyValueComp, setLightKeyTangent } from '../lib/lights';
import { evalLight, lightPoi, lightPosAt } from '../lib/lightEval';
import { round, eulerFromLookAt, lerp, handleOffset } from '../lib/eval';
import type { Light, Vec3 } from '../types';

const ONE = new THREE.Vector3(1, 1, 1);
// Per-segment colour by the ease entering the segment's end key (mirrors the camera path).
const EASE_COLOR: Record<string, string> = { linear: '#8a93a0', easeIn: '#5b9dd9', easeOut: '#4fb477', easeInOut: '#f2a33c', easeInOutStrong: '#d9614e' };
const HEIGHT_MIN_SPAN = 0.3;

// The animated light's position path in the Scene view: an ease-coloured spline with motion dots,
// optional height/speed viz, a highlighted selected segment, and draggable key + Bézier-tangent
// handles — the same editing model as the camera path (SceneGizmos), driven by the active light.
function LightPath({ light }: { light: Light }) {
  const rev = useStore(s => s.rev);
  const { gl, camera } = useThree();
  const st = S();
  const dragTarget = useRef<{ id: string; kind: 'key' | 'in' | 'out'; group?: { id: string; orig: Vec3 }[]; anchor?: Vec3 } | null>(null);

  // key + tangent-handle drag (raycast onto a plane at the key's height, Shift = vertical)
  useEffect(() => {
    const dom = gl.domElement; const rc = new THREE.Raycaster();
    const move = (e: PointerEvent) => {
      const dt = dragTarget.current; if (!dt) return;
      const l = activeLight(); if (!l) return;
      const k = l.keyframes.find(x => x.id === dt.id); if (!k || !Array.isArray(k.value)) return;
      const kv = k.value as Vec3;
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera); const p = new THREE.Vector3();
      let off: Vec3 = [0, 0, 0];
      if (dt.kind !== 'key') { const pk2 = lightKeysOf(l, 'position'); const i = pk2.findIndex(x => x.id === k.id); off = handleOffset(pk2, i, dt.kind); }
      const group = dt.group ?? [{ id: k.id, orig: kv }]; const anchor = dt.anchor ?? kv;
      if (e.shiftKey) {
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
        const a = dt.kind === 'key' ? new THREE.Vector3(...kv) : new THREE.Vector3(kv[0] + off[0], kv[1] + off[1], kv[2] + off[2]);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, a);
        if (!rc.ray.intersectPlane(plane, p)) return;
        if (dt.kind === 'key') { const dy = round(p.y, 3) - anchor[1]; for (const it of group) setLightKeyValueComp(it.id, 1, round(it.orig[1] + dy, 3)); }
        else setLightKeyTangent(k.id, dt.kind, [off[0], round(p.y - kv[1], 3), off[2]]);
      } else {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -kv[1]);
        if (!rc.ray.intersectPlane(plane, p)) return;
        if (dt.kind === 'key') { const dx = round(p.x, 3) - anchor[0], dz = round(p.z, 3) - anchor[2]; for (const it of group) { setLightKeyValueComp(it.id, 0, round(it.orig[0] + dx, 3)); setLightKeyValueComp(it.id, 2, round(it.orig[2] + dz, 3)); } }
        else setLightKeyTangent(k.id, dt.kind, [round(p.x - kv[0], 3), off[1], round(p.z - kv[2], 3)]);
      }
    };
    const up = () => { if (dragTarget.current) { dragTarget.current = null; S().setGizmoDragging(false); } };
    dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up);
    return () => { dom.removeEventListener('pointermove', move); dom.removeEventListener('pointerup', up); };
  }, [gl, camera]);

  const pk = lightKeysOf(light, 'position');
  const pts = useMemo(() => {
    if (pk.length < 2) return [] as Vec3[]; const a: Vec3[] = [];
    for (let i = 0; i <= 64; i++) a.push(lightPosAt(light, lerp(pk[0].time, pk[pk.length - 1].time, i / 64)));
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);
  const segs = useMemo(() => {
    const out: { line: Vec3[]; dots: Vec3[]; color: string }[] = [];
    for (let i = 0; i < pk.length - 1; i++) {
      const t0 = pk[i].time, t1 = pk[i + 1].time;
      const line: Vec3[] = []; for (let s = 0; s <= 24; s++) line.push(lightPosAt(light, lerp(t0, t1, s / 24)));
      const dots: Vec3[] = []; for (let s = 1; s <= 5; s++) dots.push(lightPosAt(light, lerp(t0, t1, s / 6)));
      out.push({ line, dots, color: EASE_COLOR[pk[i + 1].ease] || '#f2a33c' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);
  const selSeg = useMemo(() => {
    const ids = st.ui.selectedKeyIds; if (ids.length !== 1) return null;
    const idx = pk.findIndex(k => k.id === ids[0]); if (idx <= 0) return null;
    const a: Vec3[] = []; for (let s = 0; s <= 32; s++) a.push(lightPosAt(light, lerp(pk[idx - 1].time, pk[idx].time, s / 32)));
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);
  const splineViz = st.ui.splineViz;
  const vizColors = useMemo(() => {
    if (splineViz === 'none' || pts.length < 2) return null;
    const A = splineViz === 'height' ? [1.0, 0.92, 0.05] : [0.86, 0.94, 1.0];
    const B = splineViz === 'height' ? [1.0, 0.04, 0.0] : [0.0, 0.22, 1.0];
    const vals = splineViz === 'height' ? pts.map(p => p[1])
      : pts.map((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); });
    let lo = Infinity, hi = -Infinity, sum = 0; for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; sum += v; }
    const span = hi - lo, mean = sum / vals.length || 1e-6;
    return vals.map(v => {
      let f: number;
      if (splineViz === 'speed') f = Math.min(1, Math.max(0, (v / mean - 1) * 1.6));
      else { const denom = Math.max(span, HEIGHT_MIN_SPAN); f = Math.min(1, Math.max(0, (v - lo) / denom)); f = f * f * (3 - 2 * f); }
      return [lerp(A[0], B[0], f), lerp(A[1], B[1], f), lerp(A[2], B[2], f)] as [number, number, number];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, splineViz, pts]);

  if (pk.length < 2) return null;
  return (
    <>
      {vizColors
        ? <Line points={pts} vertexColors={vizColors} lineWidth={3.5} transparent opacity={1} />
        : segs.map((sg, i) => (
          <group key={i}>
            <Line points={sg.line} color={sg.color} lineWidth={2.5} transparent opacity={0.95} />
            {sg.dots.map((d, j) => (
              <mesh key={j} position={d} renderOrder={1}><sphereGeometry args={[0.028, 8, 8]} /><meshBasicMaterial color={sg.color} depthTest={false} transparent opacity={0.85} /></mesh>
            ))}
          </group>
        ))}
      {selSeg && <Line points={selSeg} color="#ffffff" lineWidth={5} transparent opacity={0.95} />}
      {pk.map((k, i) => {
        const sel = st.ui.selectedKeyIds.includes(k.id);
        const kv = k.value as Vec3;
        const grab = (kind: 'key' | 'in' | 'out') => (e: { stopPropagation: () => void; nativeEvent: Event }) => {
          e.stopPropagation(); (e.nativeEvent as PointerEvent).stopImmediatePropagation?.();
          if (kind === 'key' && (e.nativeEvent as PointerEvent).shiftKey) { S().toggleSelectKey(k.id); return; }
          if (kind === 'key') {
            if (!S().ui.selectedKeyIds.includes(k.id)) S().selectKey(k.id);
            const sids = S().ui.selectedKeyIds; const al = activeLight();
            const group = (al?.keyframes ?? []).filter(kf => kf.channel === 'position' && sids.includes(kf.id) && Array.isArray(kf.value)).map(kf => ({ id: kf.id, orig: (kf.value as Vec3).slice() as Vec3 }));
            dragTarget.current = { id: k.id, kind, group, anchor: (k.value as Vec3).slice() as Vec3 };
          } else { dragTarget.current = { id: k.id, kind }; S().selectKey(k.id); }
          S().setGizmoDragging(true);
        };
        const handles: { which: 'in' | 'out'; pos: Vec3 }[] = [];
        if (i < pk.length - 1) { const o = handleOffset(pk, i, 'out'); handles.push({ which: 'out', pos: [kv[0] + o[0], kv[1] + o[1], kv[2] + o[2]] }); }
        if (i > 0) { const o = handleOffset(pk, i, 'in'); handles.push({ which: 'in', pos: [kv[0] + o[0], kv[1] + o[1], kv[2] + o[2]] }); }
        return (
          <group key={k.id}>
            <mesh position={kv} userData={{ gizmo: { id: k.id, kind: 'key' } }} onPointerDown={grab('key')}>
              <sphereGeometry args={[0.055, 20, 20]} /><meshBasicMaterial color={sel ? '#ffffff' : '#f2a33c'} />
            </mesh>
            {handles.map(h => (
              <group key={h.which}>
                <Line points={[kv, h.pos]} color="#29b6f6" lineWidth={1.5} transparent opacity={0.7} />
                <mesh position={h.pos} userData={{ gizmo: { id: k.id, kind: h.which } }} onPointerDown={grab(h.which)}
                  onDoubleClick={e => { e.stopPropagation(); setLightKeyTangent(k.id, h.which, null); }}>
                  <sphereGeometry args={[0.038, 16, 16]} /><meshBasicMaterial color="#29b6f6" />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}
    </>
  );
}

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
  // captured at drag start when the light can be re-aimed, so a rotation-ring drag rotates the aim
  // around the (fixed) light position — mirroring the camera gizmo's rotation, but driving the POI.
  const dragStart = useRef<{ base: THREE.Quaternion; pos: Vec3; poi: Vec3; dist: number } | null>(null);

  // PivotControls can't run under multiview (tracks the default camera only); ambient/hemisphere have
  // no position to move. Hooks above always run — bail on render only.
  if (!l || multiview || l.kind === 'ambient' || l.kind === 'hemisphere' || l.kind === 'env') return null;

  const t = st.project.timeline.playhead;
  const pose = evalLight(l, t);
  const aims = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'area';
  const poi = aims ? lightPoi(l, t) : null;
  // World vs local gizmo frame — mirrors the camera gizmo's space toggle. In 'local' the move axes
  // align to the light's aim; in 'world' they stay world-aligned.
  // NB: evalLight only fills pose.rotation when the light has a target or POI keys. A freshly-added
  // spot (target null) still lights toward its POI (world origin by default), so derive the look-at
  // orientation from the aim HERE — otherwise 'local' would equal 'world' and the toggle looks inert.
  const d2r = THREE.MathUtils.degToRad;
  const aimRot = aims && poi ? eulerFromLookAt(pose.position, poi) : pose.rotation;
  const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(aimRot[0]), d2r(aimRot[1]), d2r(aimRot[2]), 'YXZ'));
  const baseQuat = st.ui.gizmoSpaceLight === 'local' ? localQuat : new THREE.Quaternion();
  const live = new THREE.Matrix4().compose(new THREE.Vector3(...pose.position), baseQuat, ONE);
  const matrix = gizmoDrag.current && frozen.current ? frozen.current : live;
  // Rotation rings behave like the camera gizmo, but a light aims via its POI (not a rotation channel):
  // enable them only when the light has a free aim (object-locked aim stays non-rotatable, like a
  // targeted camera).
  const canRotate = aims && l.target?.type !== 'object';

  const onDragStart = () => {
    gizmoDrag.current = true; S().setGizmoDragging(true); frozen.current = live.clone();
    dragStart.current = canRotate && poi
      ? { base: baseQuat.clone(), pos: pose.position, poi, dist: Math.max(1e-3, new THREE.Vector3(...pose.position).distanceTo(new THREE.Vector3(...poi))) }
      : null;
  };
  const onDrag = (_l: THREE.Matrix4, _dl: THREE.Matrix4, w: THREE.Matrix4) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(); w.decompose(p, q, new THREE.Vector3());
    const ds = dragStart.current;
    if (ds) {
      // A single PivotControls drag is EITHER a translate handle OR a rotation ring. Detect rotation by
      // the delta from the frame captured at drag start; if it rotated, re-aim instead of moving.
      const dq = q.clone().multiply(ds.base.clone().invert());
      if (2 * Math.acos(Math.min(1, Math.abs(dq.w))) > 1e-4) {
        const fwd = new THREE.Vector3(ds.poi[0] - ds.pos[0], ds.poi[1] - ds.pos[1], ds.poi[2] - ds.pos[2]).normalize().applyQuaternion(dq);
        const np = new THREE.Vector3(...ds.pos).addScaledVector(fwd, ds.dist);
        aimLightAt([round(np.x, 3), round(np.y, 3), round(np.z, 3)]);
        return;
      }
    }
    commitLightPosition([round(p.x, 3), round(p.y, 3), round(p.z, 3)]);
  };
  const onDragEnd = () => { gizmoDrag.current = false; frozen.current = null; dragStart.current = null; S().setGizmoDragging(false); };

  return (
    <>
      <PivotControls matrix={matrix} autoTransform fixed scale={50} lineWidth={2} depthTest={false}
        disableScaling activeAxes={[true, true, true]} disableRotations={!canRotate}
        onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}>
        {/* Small emissive marker tinted with the light's colour so the selected light reads clearly. */}
        <mesh userData={{ gizmo: { kind: 'light' } }}>
          <sphereGeometry args={[0.06, 20, 20]} />
          <meshStandardMaterial color={l.color} emissive={l.color} emissiveIntensity={0.9} roughness={0.4} metalness={0.2} />
        </mesh>
      </PivotControls>
      {poi && (<>
        <Line points={[pose.position, poi]} color={l.color} lineWidth={1.4} transparent opacity={0.5} dashed dashSize={0.12} gapSize={0.08} />
        <LightPoi poi={poi} />
      </>)}
      {/* animation path (spline + key/tangent handles) when the light has a real move */}
      <LightPath light={l} />
    </>
  );
}