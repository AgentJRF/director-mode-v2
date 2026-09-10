import * as THREE from 'three';
import { useStore, S } from '../store';
import { evaluate } from '../lib/eval';

const d2r = THREE.MathUtils.degToRad;

// Clickable marker for every camera in the Scene view (the active one is normally drawn by the
// PivotControls gizmo, so it's skipped unless we're picking for interpolation). Click selects the
// camera; during A→B interpolation it designates A then B (store.pickInterp).
export default function CameraMarkers() {
  useStore(s => s.rev);
  const proj = S().project; const t = proj.timeline.playhead; const interp = S().ui.interp;
  const activeId = proj.activeCameraId; const hidden = S().ui.hidden;
  return (
    <>
      {proj.cameras.map(c => {
        if (!interp && c.id === activeId) return null;   // active shown by the gizmo body
        if (hidden['cam:' + c.id]) return null;
        const pose = evaluate(c, t);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(pose.rotation[0]), d2r(pose.rotation[1]), d2r(pose.rotation[2]), 'YXZ'));
        const isA = !!interp && interp.a === c.id;
        const glow = isA ? 0.95 : interp ? 0.4 : 0.18;
        const onDown = (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (S().ui.interp) S().pickInterp(c.id); else S().selectCamera(c.id); };
        return (
          <group key={c.id} position={pose.position} quaternion={[q.x, q.y, q.z, q.w]}>
            <mesh position={[0, 0, 0.08]} userData={{ gizmo: { kind: 'camera' } }} onPointerDown={onDown}>
              <boxGeometry args={[0.2, 0.15, 0.24]} />
              <meshStandardMaterial color={c.color} emissive={c.color} emissiveIntensity={glow} roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]} userData={{ gizmo: { kind: 'camera' } }} onPointerDown={onDown}>
              <cylinderGeometry args={[0.06, 0.085, 0.13, 18]} />
              <meshStandardMaterial color={c.color} emissive={c.color} emissiveIntensity={glow} roughness={0.4} metalness={0.5} />
            </mesh>
            {isA && (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.26, 0.02, 8, 32]} />
                <meshBasicMaterial color="#4fb477" />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}
