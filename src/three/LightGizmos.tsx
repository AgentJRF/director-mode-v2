import { PivotControls, Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore, S } from '../store';
import { activeLight, commitLightPosition, aimLightAt } from '../lib/lights';
import { evalLight, lightPoi } from '../lib/lightEval';
import { round, eulerFromLookAt } from '../lib/eval';
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