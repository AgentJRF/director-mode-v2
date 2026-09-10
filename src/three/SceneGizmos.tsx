import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line, PivotControls } from '@react-three/drei';
import { useStore, S, upsertKeyOn } from '../store';
import { keysOf, evalChannel, lerp, round, evaluate, poiPoint, handleOffset } from '../lib/eval';
import MultiviewGizmo from './multiview/MultiviewGizmo';
import { R3, viewMarquee } from './shared';
import type { Vec3 } from '../types';

const d2r = THREE.MathUtils.degToRad, r2d = THREE.MathUtils.radToDeg;
const ONE = new THREE.Vector3(1, 1, 1);
// Per-segment colour by the ease ENTERING the segment's end key — lets each animation curve read
// distinctly, and shows at a glance which easing each segment carries.
const EASE_COLOR: Record<string, string> = { linear: '#8a93a0', easeIn: '#5b9dd9', easeOut: '#4fb477', easeInOut: '#f2a33c', easeInOutStrong: '#d9614e' };
// Minimum height range (world units) before the Height viz applies any yellow→red gradient. Below
// this the path is treated as flat, so numeric wobble on a nominally flat move doesn't turn red.
const HEIGHT_MIN_SPAN = 0.3;

export default function SceneGizmos() {
  const rev = useStore(s => s.rev);
  const multiview = useStore(s => s.ui.multiview);
  const interp = useStore(s => s.ui.interp);
  const { gl, camera, scene } = useThree();
  const st = S(); const cam = st.active(); const space = st.ui.gizmoSpace;
  const dragTarget = useRef<{ id: string; kind: 'key' | 'in' | 'out'; group?: { id: string; orig: Vec3 }[]; anchor?: Vec3 } | null>(null);
  const gizmoDrag = useRef(false);
  const frozen = useRef<THREE.Matrix4 | null>(null);
  const dragStart = useRef<{ base: THREE.Quaternion; start: THREE.Quaternion } | null>(null);

  // frustum showing what the (state-driven) render camera sees
  const frustumCam = useMemo(() => new THREE.PerspectiveCamera(45, 1.777, 0.12, 2.4), []);
  const helper = useMemo(() => new THREE.CameraHelper(frustumCam), [frustumCam]);
  const bodyRef = useRef<THREE.Group>(null);

  useFrame(() => {
    R3.sceneCam = camera as THREE.PerspectiveCamera; // expose the scene camera for the marquee overlay
    // The frustum follows the ACTIVE (selected) camera being edited — same pose as the body/gizmo/
    // spline — so switching cameras moves the frame. (WYSIWYG program selection is only for the
    // Camera POV render, not this Scene-view editing aid.)
    const a = S().active(); const t = S().project.timeline.playhead;
    const p = evaluate(a, t);
    const poi = poiPoint(a, t);
    frustumCam.position.set(p.position[0], p.position[1], p.position[2]);
    frustumCam.rotation.set(d2r(p.rotation[0]), d2r(p.rotation[1]), d2r(p.rotation[2]), 'YXZ');
    frustumCam.filmGauge = 36; frustumCam.setFocalLength(p.focalLength);
    frustumCam.aspect = S().project.canvas.width / S().project.canvas.height;
    frustumCam.far = Math.max(0.5, new THREE.Vector3(...p.position).distanceTo(new THREE.Vector3(poi[0], poi[1], poi[2])));
    frustumCam.updateProjectionMatrix(); frustumCam.updateMatrixWorld(true); helper.update();
    // NB: the camera body is a child of PivotControls (positioned by `matrix` at the camera
    // pose). It must stay at local origin — do NOT copy the world camera transform onto it.
  });

  // current camera pose (from state)
  const pose = evaluate(cam, st.project.timeline.playhead);
  const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(pose.rotation[0]), d2r(pose.rotation[1]), d2r(pose.rotation[2]), 'YXZ'));
  const baseQuat = space === 'local' ? camQuat : new THREE.Quaternion();
  const liveMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...pose.position), baseQuat, ONE);
  const matrix = gizmoDrag.current && frozen.current ? frozen.current : liveMatrix;

  const onDragStart = () => {
    gizmoDrag.current = true; S().setGizmoDragging(true);
    const p = evaluate(S().active(), S().project.timeline.playhead);
    const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(p.rotation[0]), d2r(p.rotation[1]), d2r(p.rotation[2]), 'YXZ'));
    dragStart.current = { base: baseQuat.clone(), start: sq };
    frozen.current = liveMatrix.clone();
  };
  const onDrag = (_l: THREE.Matrix4, _dl: THREE.Matrix4, w: THREE.Matrix4) => {
    if (!dragStart.current) return;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); w.decompose(p, q, s);
    const c = S().active(); const time = S().project.timeline.playhead;
    const pos: Vec3 = [round(p.x, 3), round(p.y, 3), round(p.z, 3)];
    if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', pos, time, 'manual'); else c.transform.position = pos;
    if (!c.target) {
      const deltaQ = q.clone().multiply(dragStart.current.base.clone().invert());
      const newQ = deltaQ.multiply(dragStart.current.start);
      const e = new THREE.Euler().setFromQuaternion(newQ, 'YXZ');
      const rot: Vec3 = [r2d(e.x), r2d(e.y), r2d(e.z)];
      if (keysOf(c, 'rotation').length) upsertKeyOn(c, 'rotation', rot, time, 'manual'); else c.transform.rotation = rot;
    }
    S().bump();
  };
  const onDragEnd = () => { gizmoDrag.current = false; frozen.current = null; dragStart.current = null; S().setGizmoDragging(false); };

  // spline keyframe + tangent-handle drag (single-view). In multiview, useMultiviewInput owns
  // input instead (per-quadrant cameras), so this listener set stays off.
  useEffect(() => {
    if (multiview) return;
    const dom = gl.domElement; const rc = new THREE.Raycaster();
    const move = (e: PointerEvent) => {
      const dt = dragTarget.current; if (!dt) return;
      const c = S().active();
      const k = c.keyframes.find(k => k.id === dt.id); if (!k || !Array.isArray(k.value)) return;
      const kv = k.value as Vec3;
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      // current tangent offset (for handles), to preserve axes we're not editing
      let off: Vec3 = [0, 0, 0];
      if (dt.kind !== 'key') { const pk2 = keysOf(c, 'position'); const i = pk2.findIndex(x => x.id === k.id); off = handleOffset(pk2, i, dt.kind); }
      const group = dt.group ?? [{ id: k.id, orig: kv }]; const anchor = dt.anchor ?? kv; // group drag: move all selected keys by the same delta
      if (e.shiftKey) {
        // vertical (Y): intersect a camera-facing vertical plane through the drag target
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
        const a = dt.kind === 'key' ? new THREE.Vector3(...kv) : new THREE.Vector3(kv[0] + off[0], kv[1] + off[1], kv[2] + off[2]);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, a);
        if (!rc.ray.intersectPlane(plane, p)) return;
        if (dt.kind === 'key') { const dy = round(p.y, 3) - anchor[1]; for (const it of group) S().setKeyValueComp(it.id, 1, round(it.orig[1] + dy, 3)); }
        else S().setKeyTangent(k.id, dt.kind, [off[0], round(p.y - kv[1], 3), off[2]]);
      } else {
        // horizontal (X/Z): plane at the key's height
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -kv[1]);
        if (!rc.ray.intersectPlane(plane, p)) return;
        if (dt.kind === 'key') { const dx = round(p.x, 3) - anchor[0], dz = round(p.z, 3) - anchor[2]; for (const it of group) { S().setKeyValueComp(it.id, 0, round(it.orig[0] + dx, 3)); S().setKeyValueComp(it.id, 2, round(it.orig[2] + dz, 3)); } }
        else S().setKeyTangent(k.id, dt.kind, [round(p.x - kv[0], 3), off[1], round(p.z - kv[2], 3)]);
      }
    };
    const up = () => { if (dragTarget.current) { dragTarget.current = null; S().setGizmoDragging(false); } };
    dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up);
    return () => { dom.removeEventListener('pointermove', move); dom.removeEventListener('pointerup', up); };
  }, [gl, camera, multiview]);

  // Marquee selection (single Scene view): with the Select tool, drag empty space to rubber-band
  // position keys. Orbit is disabled in Select mode (Scene.tsx), so an empty drag is free to select.
  useEffect(() => {
    const dom = gl.domElement; const rc = new THREE.Raycaster(); let start: { x: number; y: number } | null = null;
    const active = () => !S().ui.multiview && S().ui.viewMode === 'scene' && S().ui.tool === 'select';
    // Meshes whose press must NOT start a marquee: keyframe/tangent handles AND the camera body
    // (so grabbing the camera to move it never rubber-bands a box behind it).
    const blockMeshes = () => { const o: THREE.Object3D[] = []; scene.traverse(n => { const g = (n.userData as { gizmo?: { kind: string } }).gizmo; if (g && (g.kind === 'key' || g.kind === 'in' || g.kind === 'out' || g.kind === 'camera')) o.push(n); }); return o; };
    const wrapRect = () => (R3.wrap ?? dom).getBoundingClientRect();
    const down = (e: PointerEvent) => {
      if (!active() || e.button !== 0) return;
      if (S().ui.interp) return; // picking cameras for A→B interpolation → no marquee
      if (S().ui.gizmoDragging || gizmoDrag.current) return; // a gizmo drag started (axis/plane) → no marquee
      const r = dom.getBoundingClientRect();
      rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      if (rc.intersectObjects(blockMeshes(), false).length) return; // pressing a key or the camera → let its handler run
      const rr = wrapRect(); start = { x: e.clientX - rr.left, y: e.clientY - rr.top };
      // Don't show the box yet: wait for a real drag in `move`, and bail if a gizmo drag starts in
      // the meantime — the down-time guard alone missed it (PivotControls sets gizmoDragging slightly
      // later), which left a rubber-band box behind the camera while moving it.
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      if (S().ui.gizmoDragging || gizmoDrag.current) { start = null; if (viewMarquee.rect) { viewMarquee.rect = null; S().bump(); } return; }
      const rr = wrapRect(); const px = e.clientX - rr.left, py = e.clientY - rr.top;
      if (!viewMarquee.rect && Math.hypot(px - start.x, py - start.y) < 3) return; // below drag threshold → not a marquee yet
      viewMarquee.rect = { x: Math.min(start.x, px), y: Math.min(start.y, py), w: Math.abs(px - start.x), h: Math.abs(py - start.y) }; S().bump();
    };
    const up = () => {
      if (!start) return; const rect = viewMarquee.rect; const click = { ...start }; start = null; viewMarquee.rect = null;
      const rr = wrapRect(); const c = S().active(); const v = new THREE.Vector3();
      if (rect && (rect.w > 4 || rect.h > 4)) {
        // drag → marquee multi-select of position keys
        const ids: string[] = [];
        for (const k of c.keyframes) {
          if (k.channel !== 'position' || !Array.isArray(k.value)) continue;
          v.set(...(k.value as Vec3)).project(camera); if (v.z > 1) continue;
          const sx = (v.x * 0.5 + 0.5) * rr.width, sy = (-v.y * 0.5 + 0.5) * rr.height;
          if (sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) ids.push(k.id);
        }
        S().setSelectedKeys(ids);
      } else {
        // click → select the path SEGMENT under the cursor (its END key carries the incoming ease)
        const pkl = keysOf(c, 'position'); let bestEnd: string | null = null, bestD = 12;
        for (let i = 0; i < pkl.length - 1; i++) {
          for (let s = 1; s <= 11; s++) {
            v.set(...(evalChannel(c, 'position', lerp(pkl[i].time, pkl[i + 1].time, s / 12)) as Vec3)).project(camera);
            if (v.z > 1) continue;
            const sx = (v.x * 0.5 + 0.5) * rr.width, sy = (-v.y * 0.5 + 0.5) * rr.height;
            const d = Math.hypot(sx - click.x, sy - click.y);
            if (d < bestD) { bestD = d; bestEnd = pkl[i + 1].id; }
          }
        }
        S().selectKey(bestEnd); // segment end key, or clear if the click missed the path
      }
      S().bump();
    };
    dom.addEventListener('pointerdown', down); dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up);
    return () => { dom.removeEventListener('pointerdown', down); dom.removeEventListener('pointermove', move); dom.removeEventListener('pointerup', up); };
  }, [gl, camera, scene]);

  const pk = keysOf(cam, 'position');
  const pts = useMemo(() => {
    if (pk.length < 2) return [] as Vec3[]; const a: Vec3[] = [];
    for (let i = 0; i <= 64; i++) { const t = lerp(pk[0].time, pk[pk.length - 1].time, i / 64); a.push(evalChannel(cam, 'position', t) as Vec3); }
    return a;
  }, [rev]);

  // Per-segment geometry: a line coloured by the segment's ease + a few even-TIME motion dots whose
  // on-path spacing reveals the rhythm (bunched = slow, spread = fast). Far fewer dots than before.
  const segs = useMemo(() => {
    const out: { line: Vec3[]; dots: Vec3[]; color: string }[] = [];
    for (let i = 0; i < pk.length - 1; i++) {
      const t0 = pk[i].time, t1 = pk[i + 1].time;
      const line: Vec3[] = []; for (let s = 0; s <= 24; s++) line.push(evalChannel(cam, 'position', lerp(t0, t1, s / 24)) as Vec3);
      const dots: Vec3[] = []; for (let s = 1; s <= 5; s++) dots.push(evalChannel(cam, 'position', lerp(t0, t1, s / 6)) as Vec3);
      out.push({ line, dots, color: EASE_COLOR[pk[i + 1].ease] || '#f2a33c' });
    }
    return out;
  }, [rev]);

  // Highlighted sub-path for the currently-selected segment (a single non-first position key → the
  // segment that ENDS on it). Lets the user see which segment's curve they're editing.
  const selSeg = useMemo(() => {
    const ids = st.ui.selectedKeyIds; if (ids.length !== 1) return null;
    const idx = pk.findIndex(k => k.id === ids[0]); if (idx <= 0) return null;
    const a: Vec3[] = []; for (let s = 0; s <= 32; s++) a.push(evalChannel(cam, 'position', lerp(pk[idx - 1].time, pk[idx].time, s / 32)) as Vec3);
    return a;
  }, [rev]);

  // Optional per-vertex gradient on the path, toggled from the timeline.
  //  HEIGHT (Y) = yellow → red, normalized to the path's own Y range.
  //  SPEED = white → blue, keyed to how much FASTER than the path's mean a sample is — so a constant
  //  speed (e.g. linear ease on straight segments) stays ONE uniform colour and only real
  //  accelerations turn blue (segment length ∝ speed, since samples are uniform in time).
  const splineViz = st.ui.splineViz;
  const vizColors = useMemo(() => {
    if (splineViz === 'none' || pts.length < 2) return null;
    const A = splineViz === 'height' ? [1.0, 0.92, 0.05] : [0.86, 0.94, 1.0];  // low / baseline
    const B = splineViz === 'height' ? [1.0, 0.04, 0.0] : [0.0, 0.22, 1.0];    // high / fast
    const vals = splineViz === 'height'
      ? pts.map(p => p[1])
      : pts.map((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); });
    let lo = Infinity, hi = -Infinity, sum = 0; for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; sum += v; }
    const span = hi - lo, mean = sum / vals.length || 1e-6;
    return vals.map(v => {
      let f: number;
      if (splineViz === 'speed') f = Math.min(1, Math.max(0, (v / mean - 1) * 1.6)); // constant → 0 (uniform); faster than mean → blue
      // Height: normalize against an ABSOLUTE minimum span (world units) so a flat path isn't stretched
      // to full yellow→red by sub-millimetre wobble — only a real height change (≥ HEIGHT_MIN_SPAN) colours.
      else { const denom = Math.max(span, HEIGHT_MIN_SPAN); f = Math.min(1, Math.max(0, (v - lo) / denom)); f = f * f * (3 - 2 * f); }
      return [lerp(A[0], B[0], f), lerp(A[1], B[1], f), lerp(A[2], B[2], f)] as [number, number, number];
    });
  }, [rev, splineViz, pts]);

  return (
    <>
      <primitive object={helper} />
      {/* In multiview the PivotControls gizmo is hidden (it only works with the default camera);
          the camera body is tagged so useMultiviewInput can drag the camera per-view instead.
          During A→B interpolation it's hidden too — CameraMarkers draws all cameras for picking. */}
      {!interp && <PivotControls matrix={matrix} autoTransform fixed scale={50} lineWidth={2} depthTest={false}
        disableScaling activeAxes={[true, true, true]}
        disableAxes={multiview} disableSliders={multiview} disableRotations={multiview || !!cam.target}
        onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}>
        <group ref={bodyRef}>
          {/* Body tinted with the camera's own colour (+ emissive) so the SELECTED camera stays
              identifiable and visible — matching the coloured markers of the other cameras. */}
          <mesh position={[0, 0, 0.08]} userData={{ gizmo: { kind: 'camera' } }}><boxGeometry args={[0.22, 0.16, 0.26]} /><meshStandardMaterial color={cam.color} emissive={cam.color} emissiveIntensity={0.5} roughness={0.5} metalness={0.4} /></mesh>
          <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]} userData={{ gizmo: { kind: 'camera' } }}><cylinderGeometry args={[0.07, 0.09, 0.14, 20]} /><meshStandardMaterial color={cam.color} emissive={cam.color} emissiveIntensity={0.5} roughness={0.4} metalness={0.5} /></mesh>
        </group>
      </PivotControls>}
      {pts.length >= 2 && (vizColors
        ? <Line points={pts} vertexColors={vizColors} lineWidth={3.5} transparent opacity={1} />
        : segs.map((sg, i) => (
          <group key={i}>
            <Line points={sg.line} color={sg.color} lineWidth={2.5} transparent opacity={0.95} />
            {sg.dots.map((d, j) => (
              <mesh key={j} position={d} renderOrder={1}>
                <sphereGeometry args={[0.028, 8, 8]} />
                <meshBasicMaterial color={sg.color} depthTest={false} transparent opacity={0.85} />
              </mesh>
            ))}
          </group>
        )))}
      {/* highlighted selected segment (the one whose curve is being edited) */}
      {selSeg && <Line points={selSeg} color="#ffffff" lineWidth={5} transparent opacity={0.95} />}
      {pk.map((k, i) => {
        const sel = st.ui.selectedKeyIds.includes(k.id);
        const kv = k.value as Vec3;
        const grab = (kind: 'key' | 'in' | 'out') => (e: { stopPropagation: () => void; nativeEvent: Event }) => {
          e.stopPropagation(); (e.nativeEvent as PointerEvent).stopImmediatePropagation?.();
          if (kind === 'key' && (e.nativeEvent as PointerEvent).shiftKey) { S().toggleSelectKey(k.id); return; } // Shift+click: add/remove from selection
          if (kind === 'key') {
            // grabbing an unselected key selects it alone; grabbing a selected one keeps the whole
            // selection and drags the group together (relative offsets preserved)
            if (!S().ui.selectedKeyIds.includes(k.id)) S().selectKey(k.id);
            const sel = S().ui.selectedKeyIds; const c0 = S().active();
            const group = c0.keyframes.filter(kf => kf.channel === 'position' && sel.includes(kf.id) && Array.isArray(kf.value)).map(kf => ({ id: kf.id, orig: (kf.value as Vec3).slice() as Vec3 }));
            dragTarget.current = { id: k.id, kind, group, anchor: (k.value as Vec3).slice() as Vec3 };
          } else {
            dragTarget.current = { id: k.id, kind }; S().selectKey(k.id);
          }
          S().setGizmoDragging(true);
        };
        // tangent handles: 'out' for every key but the last, 'in' for every key but the first
        const handles: { which: 'in' | 'out'; pos: Vec3 }[] = [];
        if (i < pk.length - 1) { const o = handleOffset(pk, i, 'out'); handles.push({ which: 'out', pos: [kv[0] + o[0], kv[1] + o[1], kv[2] + o[2]] }); }
        if (i > 0) { const o = handleOffset(pk, i, 'in'); handles.push({ which: 'in', pos: [kv[0] + o[0], kv[1] + o[1], kv[2] + o[2]] }); }
        return (
          <group key={k.id}>
            <mesh position={kv} userData={{ gizmo: { id: k.id, kind: 'key' } }} onPointerDown={multiview ? undefined : grab('key')}>
              <sphereGeometry args={[0.055, 20, 20]} />
              <meshBasicMaterial color={sel ? '#ffffff' : '#f2a33c'} />
            </mesh>
            {handles.map(h => (
              <group key={h.which}>
                <Line points={[kv, h.pos]} color="#29b6f6" lineWidth={1.5} transparent opacity={0.7} />
                <mesh position={h.pos} userData={{ gizmo: { id: k.id, kind: h.which } }} onPointerDown={multiview ? undefined : grab(h.which)}
                  onDoubleClick={e => { e.stopPropagation(); S().setKeyTangent(k.id, h.which, null); }}>
                  <sphereGeometry args={[0.038, 16, 16]} />
                  <meshBasicMaterial color="#29b6f6" />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}
      {/* Multiview gizmos: drei <PivotControls> can't run under scissor multiview (it only tracks the
          default camera), so we mirror it with tagged scene meshes that render in every quadrant.
          Camera gets the full translate+plane+rotate gizmo (rotation only when a target isn't driving
          the aim); POI gets translate+plane plus a centre handle for free view-plane drag. */}
      {multiview && (() => {
        const poi = poiPoint(cam, st.project.timeline.playhead);
        const camPose = evaluate(cam, st.project.timeline.playhead).position as Vec3;
        // Screen-fixed sizing/billboarding is applied per quadrant by gizmoLayout (from the renderer).
        return (
          <>
            <MultiviewGizmo origin={camPose} kind="camera" rotation={!cam.target} quaternion={[baseQuat.x, baseQuat.y, baseQuat.z, baseQuat.w]} />
            <MultiviewGizmo origin={poi} kind="poi" />
          </>
        );
      })()}
    </>
  );
}
