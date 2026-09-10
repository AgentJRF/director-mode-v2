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
  // World vs local gizmo frame — mirrors the camera gizmo's space toggle. In 'local' the move axes
  // align to the light's aim orientation; in 'world' they stay world-aligned.
  const d2r = THREE.MathUtils.degToRad;
  const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(pose.rotation[0]), d2r(pose.rotation[1]), d2r(pose.rotation[2]), 'YXZ'));
  const baseQuat = st.ui.gizmoSpace === 'local' ? localQuat : new THREE.Quaternion();
  const live = new THREE.Matrix4().compose(new THREE.Vector3(...pose.position), baseQuat, ONE);
  const matrix = gizmoDrag.current && frozen.current ? frozen.current : live;
  const aims = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'area';
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