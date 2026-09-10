import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { S, useStore } from '../store';
import { evalLight, lightPoi } from '../lib/lightEval';
import { lightHideKey } from '../lib/lightRig';
import type { Light } from '../types';

// RectAreaLight needs its BRDF lookup tables initialised once before any area light renders.
RectAreaLightUniformsLib.init();

// One scene light, driven imperatively each frame from the store (position/intensity/aim animate with
// the playhead without re-rendering React). Structural props (kind) come from the store on re-render.
function LightNode({ light }: { light: Light }) {
  const ref = useRef<any>(null);
  // Persistent aim target for spot/directional. Kept in the scene graph via <primitive> so its
  // matrixWorld updates; only assigned as the light's target when the light actually aims.
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const l = S().project.lights.find(x => x.id === light.id);
    const o = ref.current;
    if (!l || !o) return;
    const t = S().project.timeline.playhead;
    o.visible = !S().ui.hidden[lightHideKey(l.id)];
    const pose = evalLight(l, t);
    o.intensity = pose.intensity;
    o.color.set(l.color);
    if (l.kind === 'hemisphere') (o as THREE.HemisphereLight).groundColor.set(l.groundColor || '#000000');
    if (l.kind === 'spot' || l.kind === 'directional' || l.kind === 'point' || l.kind === 'area') {
      o.position.set(pose.position[0], pose.position[1], pose.position[2]);
    }
    if (l.kind === 'spot' || l.kind === 'directional') {
      const aim = lightPoi(l, t);
      target.position.set(aim[0], aim[1], aim[2]);
      target.updateMatrixWorld();
      o.target = target;
    }
    if (l.kind === 'area') {
      const s = o as THREE.RectAreaLight;
      s.width = l.width ?? 4; s.height = l.height ?? 2;
      const aim = lightPoi(l, t);
      o.lookAt(aim[0], aim[1], aim[2]); // RectAreaLight aims via its own orientation (no .target)
    }
    if (l.kind === 'spot') {
      const s = o as THREE.SpotLight;
      s.angle = l.angle ?? 0.6; s.penumbra = l.penumbra ?? 0.5;
      s.distance = l.distance ?? 0; s.decay = l.decay ?? 1.2;
      s.castShadow = !!l.castShadow;
    }
  });

  // Initial props (first paint) — useFrame keeps them in sync afterwards.
  const pos = light.transform.position;
  switch (light.kind) {
    case 'ambient':
      return <ambientLight ref={ref} intensity={light.intensity} color={light.color} />;
    case 'hemisphere':
      return <hemisphereLight ref={ref} args={[light.color, light.groundColor || '#000000', light.intensity]} />;
    case 'point':
      return <pointLight ref={ref} position={pos} intensity={light.intensity} color={light.color}
        distance={light.distance ?? 0} decay={light.decay ?? 1.2} />;
    case 'area':
      return <rectAreaLight ref={ref} position={pos} intensity={light.intensity} color={light.color}
        width={light.width ?? 4} height={light.height ?? 2} />;
    case 'directional':
      return (<>
        <directionalLight ref={ref} position={pos} intensity={light.intensity} color={light.color} />
        <primitive object={target} />
      </>);
    case 'spot':
      return (<>
        <spotLight ref={ref} position={pos} intensity={light.intensity} color={light.color}
          angle={light.angle ?? 0.6} penumbra={light.penumbra ?? 0.5}
          distance={light.distance ?? 40} decay={light.decay ?? 1.2}
          castShadow={!!light.castShadow} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} />
        <primitive object={target} />
      </>);
    default:
      return null;
  }
}

// Renders all store lights. Re-renders only when lights are added/removed/retyped (rev bump);
// per-frame value updates happen inside each LightNode's useFrame.
export default function SceneLights() {
  useStore(s => s.rev);
  const lights = S().project.lights;
  return <>{lights.map(l => <LightNode key={l.id + ':' + l.kind} light={l} />)}</>;
}