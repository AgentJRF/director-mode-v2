import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { Vec3 } from '../../types';
import { registerGizmo } from './gizmoLayout';

// A faithful replica of the single-view drei <PivotControls> (and its POI reticle), built from plain
// tagged scene meshes so it renders in every scissored quadrant. Geometry uses drei's unit proportions
// (arrow length 1, cone 0.2, quarter-circle rotators r=0.65); gizmoLayout rescales it to a constant
// pixel size per view. useMultiviewInput picks the meshes by their `userData.gizmo` tag.
const AXIS = ['#ff2060', '#20df80', '#2080ff']; // drei PivotControls default X, Y, Z
const POI_COLOR = '#29b6f6';
const UNIT: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const ARROW_ROT: Vec3[] = [[0, 0, -Math.PI / 2], [0, 0, 0], [Math.PI / 2, 0, 0]];
const PLANE_ROT: Vec3[] = [[0, Math.PI / 2, 0], [Math.PI / 2, 0, 0], [0, 0, 0]];
const INPLANE: [number, number][] = [[1, 2], [0, 2], [0, 1]]; // the two axes each rotator/plane spans
const CONE_L = 0.2, CYL_L = 0.8, CONE_W = 0.045, CYL_W = 0.018, PLANE_OFF = 0.22, PLANE_SZ = 0.2, ARC_R = 0.65;

// quarter-circle arc (drei rotator) for rotation around axis `a`, in the plane of the other two axes
function arcPoints(a: number): Vec3[] {
  const [u, v] = INPLANE[a]; const pts: Vec3[] = [];
  for (let j = 0; j <= 24; j++) { const t = (j * Math.PI) / (2 * 24); const p: Vec3 = [0, 0, 0]; p[u] = Math.cos(t) * ARC_R; p[v] = Math.sin(t) * ARC_R; pts.push(p); }
  return pts;
}

export default function MultiviewGizmo({ origin, kind, rotation, quaternion }: { origin: Vec3; kind: 'camera' | 'poi'; rotation?: boolean; quaternion?: [number, number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!ref.current) return;
    return registerGizmo({ group: ref.current, sizePx: kind === 'camera' ? 50 : 15, billboard: kind === 'poi' });
  }, [kind]);

  if (kind === 'poi') {
    // circle + translucent fill + "+" crosshair — identical to the single-view .poi-handle controller,
    // billboarded (faced to each view's camera) and screen-fixed by the layout.
    return (
      <group ref={ref} position={origin}>
        <mesh userData={{ gizmo: { kind: 'poi' } }} renderOrder={998}>
          <circleGeometry args={[0.48, 40]} /><meshBasicMaterial color={POI_COLOR} transparent opacity={0.14} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
        <mesh userData={{ gizmo: { kind: 'poi' } }} renderOrder={999}>
          <torusGeometry args={[0.5, 0.045, 8, 44]} /><meshBasicMaterial color={POI_COLOR} depthTest={false} transparent />
        </mesh>
        <Line points={[[-0.42, 0, 0], [0.42, 0, 0]]} color={POI_COLOR} lineWidth={1.5} depthTest={false} transparent />
        <Line points={[[0, -0.42, 0], [0, 0.42, 0]]} color={POI_COLOR} lineWidth={1.5} depthTest={false} transparent />
      </group>
    );
  }

  return (
    <group ref={ref} position={origin} quaternion={quaternion}>
      {/* translate arrows */}
      {UNIT.map((d, a) => (
        <group key={'ax' + a}>
          <mesh position={[d[0] * CYL_L / 2, d[1] * CYL_L / 2, d[2] * CYL_L / 2]} rotation={ARROW_ROT[a]} renderOrder={999} userData={{ gizmo: { kind: 'camera-axis', axis: a } }}>
            <cylinderGeometry args={[CYL_W, CYL_W, CYL_L, 8]} /><meshBasicMaterial color={AXIS[a]} depthTest={false} transparent />
          </mesh>
          <mesh position={[d[0] * (CYL_L + CONE_L / 2), d[1] * (CYL_L + CONE_L / 2), d[2] * (CYL_L + CONE_L / 2)]} rotation={ARROW_ROT[a]} renderOrder={999} userData={{ gizmo: { kind: 'camera-axis', axis: a } }}>
            <coneGeometry args={[CONE_W, CONE_L, 16]} /><meshBasicMaterial color={AXIS[a]} depthTest={false} transparent />
          </mesh>
        </group>
      ))}
      {/* plane sliders */}
      {UNIT.map((_, n) => {
        const [u, v] = INPLANE[n]; const pos: Vec3 = [0, 0, 0]; pos[u] = PLANE_OFF; pos[v] = PLANE_OFF;
        return (
          <mesh key={'pl' + n} position={pos} rotation={PLANE_ROT[n]} renderOrder={999} userData={{ gizmo: { kind: 'camera-plane', axis: n } }}>
            <planeGeometry args={[PLANE_SZ, PLANE_SZ]} /><meshBasicMaterial color={AXIS[n]} transparent opacity={0.5} side={THREE.DoubleSide} depthTest={false} />
          </mesh>
        );
      })}
      {/* rotation arcs (quarter circles) with a mid-arc grab dot for picking */}
      {rotation && UNIT.map((_, a) => {
        const [u, v] = INPLANE[a]; const mid: Vec3 = [0, 0, 0]; mid[u] = Math.cos(Math.PI / 4) * ARC_R; mid[v] = Math.sin(Math.PI / 4) * ARC_R;
        return (
          <group key={'arc' + a}>
            <Line points={arcPoints(a)} color={AXIS[a]} lineWidth={3} depthTest={false} transparent />
            <mesh position={mid} renderOrder={999} userData={{ gizmo: { kind: 'camera-rot', axis: a } }}>
              <sphereGeometry args={[0.05, 10, 10]} /><meshBasicMaterial color={AXIS[a]} depthTest={false} transparent />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
