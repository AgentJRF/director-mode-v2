import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore, S } from '../store';
import { activeLight } from '../lib/lights';
import { evalLight, lightPoi } from '../lib/lightEval';

// Unity-style "influence" wireframes for the SELECTED light: a spot cone, an area rectangle + normal,
// a point falloff sphere, or a surrounding dome. Purely visual (non-interactive) — the draggable pivot
// and POI crosshair live in LightGizmos. Drawn without depth-test so it reads over the geometry.

type Pts = [number, number, number][];
const V = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

// Orthonormal basis with `f` as forward (aim direction).
function basis(fwd: THREE.Vector3) {
  const f = fwd.clone();
  if (f.lengthSq() < 1e-9) f.set(0, -1, 0); else f.normalize();
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(f.dot(up)) > 0.99) up = new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(f, up).normalize();
  const trueUp = new THREE.Vector3().crossVectors(right, f).normalize();
  return { f, right, trueUp };
}

// Closed circle in the plane spanned by (aR, aU) around `center`.
function circlePts(center: THREE.Vector3, aR: THREE.Vector3, aU: THREE.Vector3, radius: number, seg = 48): Pts {
  const out: Pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push(V(center.clone().addScaledVector(aR, Math.cos(a) * radius).addScaledVector(aU, Math.sin(a) * radius)));
  }
  return out;
}

export default function LightInfluence() {
  const multiview = useStore(s => s.ui.multiview);
  useStore(s => s.rev);
  const st = S();
  const l = st.ui.inspect === 'light' ? activeLight() : null;
  if (!l || multiview || l.kind === 'ambient' || l.kind === 'env') return null;

  const t = st.project.timeline.playhead;
  const pose = evalLight(l, t);
  const pos = new THREE.Vector3(...pose.position);
  const aimArr = lightPoi(l, t);
  const aim = new THREE.Vector3(aimArr[0], aimArr[1], aimArr[2]);

  const segs: Pts[] = [];

  if (l.kind === 'spot') {
    // Compact DCC-style cone: a short fixed length near the source (a gizmo, not the physical beam),
    // so the shape reads regardless of the real falloff distance. Radius follows the actual cone angle.
    const CONE_LEN = 1.4;
    const { f, right, trueUp } = basis(aim.clone().sub(pos));
    const endC = pos.clone().addScaledVector(f, CONE_LEN);
    const endR = CONE_LEN * Math.tan(l.angle ?? 0.6);
    segs.push(circlePts(endC, right, trueUp, endR));
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const p = endC.clone().addScaledVector(right, Math.cos(a) * endR).addScaledVector(trueUp, Math.sin(a) * endR);
      segs.push([V(pos), V(p)]);
    }
  } else if (l.kind === 'point') {
    // Point = omnidirectional emission from a single point → a compact 3D "star" of short rays.
    const rays = 0.55;
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
      [0.6, 0.6, 0.6], [-0.6, -0.6, 0.6], [0.6, -0.6, -0.6], [-0.6, 0.6, -0.6]] as const;
    for (const d of dirs) {
      const v = new THREE.Vector3(d[0], d[1], d[2]).normalize();
      segs.push([V(pos.clone().addScaledVector(v, 0.12)), V(pos.clone().addScaledVector(v, rays))]);
    }
  } else if (l.kind === 'area') {
    const { f, right, trueUp } = basis(aim.clone().sub(pos));
    const hw = (l.width ?? 4) / 2, hh = (l.height ?? 2) / 2;
    const c1 = pos.clone().addScaledVector(right, hw).addScaledVector(trueUp, hh);
    const c2 = pos.clone().addScaledVector(right, -hw).addScaledVector(trueUp, hh);
    const c3 = pos.clone().addScaledVector(right, -hw).addScaledVector(trueUp, -hh);
    const c4 = pos.clone().addScaledVector(right, hw).addScaledVector(trueUp, -hh);
    segs.push([V(c1), V(c2), V(c3), V(c4), V(c1)]);
    const tip = pos.clone().addScaledVector(f, 1.2);
    segs.push([V(pos), V(tip)]);
    const ah = 0.2;
    segs.push([V(tip), V(tip.clone().addScaledVector(f, -ah).addScaledVector(right, ah))]);
    segs.push([V(tip), V(tip.clone().addScaledVector(f, -ah).addScaledVector(right, -ah))]);
  } else if (l.kind === 'directional') {
    const { f, right, trueUp } = basis(aim.clone().sub(pos));
    const tip = pos.clone().addScaledVector(f, 2.4);
    segs.push([V(pos), V(tip)]);
    const ah = 0.3;
    for (const a of [right, right.clone().negate(), trueUp, trueUp.clone().negate()]) {
      segs.push([V(tip), V(tip.clone().addScaledVector(f, -ah).addScaledVector(a, ah * 0.7))]);
    }
  }
  // Dome (hemisphere): the surrounding sphere is simulated but intentionally NOT drawn — no gizmo.

  if (!segs.length) return null;
  return (
    <group>
      {segs.map((pts, i) => (
        <Line key={i} points={pts} color={l.color} lineWidth={1.3} transparent opacity={0.7}
          depthTest={false} raycast={() => null} />
      ))}
    </group>
  );
}
