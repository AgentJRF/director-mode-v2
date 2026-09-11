import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { S } from '../store';
import { clamp, evaluate } from '../lib/eval';
import SceneLights from './SceneLights';

const URL = '/asset/Outdoor_Bag_Blue_orange_V03.glb';

// Studio product + pedestal, read-only, for a secondary preview canvas. The main canvas mutates the
// shared GLTF `scene` transform via <primitive>, so we clone, reset the clone to identity, measure,
// then place via a wrapper group.
function Model() {
  const { scene } = useGLTF(URL);
  const d = useMemo(() => {
    const obj = scene.clone(true); // clone shares geometry → safe in a 2nd WebGL context
    obj.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    obj.position.set(0, 0, 0); obj.scale.set(1, 1, 1); obj.rotation.set(0, 0, 0); obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 2.0 / Math.max(size.y, 1e-6);
    const pos: [number, number, number] = [-center.x * s, 0.5 - box.min.y * s, -center.z * s];
    const footR = clamp(Math.max(size.x, size.z) * s * 0.62, 0.6, 2.4);
    return { obj, s, pos, footR };
  }, [scene]);
  return (
    <group>
      <mesh position={[0, 0.25, 0]} scale={[d.footR / 1.15, 1, d.footR / 1.15]}>
        <cylinderGeometry args={[1.15, 1.35, 0.5, 48]} /><meshStandardMaterial color="#1a1e22" roughness={0.6} metalness={0.3} />
      </mesh>
      <group scale={d.s} position={d.pos}><primitive object={d.obj} /></group>
    </group>
  );
}

// Shared studio canvas (bg, fog, lights, ground, product). Children = a camera rig that positions the
// default camera. No postprocessing: a 2nd EffectComposer in an extra WebGL context renders black.
export function StudioCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} style={{ width: '100%', height: '100%' }}
      onCreated={({ scene, gl }) => { scene.background = new THREE.Color(0x1a1e22); scene.fog = new THREE.Fog(0x1a1e22, 22, 48); gl.toneMappingExposure = 1.25; }}>
      {/* Same lights/IBL as the main scene (SceneLights reads the store) so the split preview matches
          the Camera view. Floor is a shadow catcher (no visible disc), mirroring the main scene. */}
      <SceneLights />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[26, 64]} /><shadowMaterial transparent opacity={0.35} />
      </mesh>
      <Suspense fallback={null}><Model /></Suspense>
      {children}
    </Canvas>
  );
}

// Rig driving the default camera to the ON-AIR camera's live pose (position/rotation/focal), each
// frame — used by the split-view camera pane so it tracks edits, playback AND multi-camera cuts.
export function LiveCameraRig() {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const size = useThree(s => s.size);
  useFrame(() => {
    const p = evaluate(S().renderCamera(), S().project.timeline.playhead);
    camera.position.set(p.position[0], p.position[1], p.position[2]);
    const e = p.rotation.map(THREE.MathUtils.degToRad);
    camera.rotation.set(e[0], e[1], e[2], 'YXZ');
    camera.filmGauge = 36; camera.setFocalLength(p.focalLength);
    camera.aspect = Math.max(0.2, size.width / size.height); camera.near = 0.1; camera.far = 200;
    camera.updateProjectionMatrix();
  });
  return null;
}
