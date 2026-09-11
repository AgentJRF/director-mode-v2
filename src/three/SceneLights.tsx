import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { S, useStore } from '../store';
import { evalLight, lightPoi } from '../lib/lightEval';
import { lightHideKey } from '../lib/lightRig';
import { hdriThumbs, makeHdriThumb } from '../lib/hdriThumb';
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
        {/* distance 0 = unlimited range (decay still attenuates). three ties the shadow-map far plane
            to `distance` (far = distance || camera.far); a short distance was CLIPPING the cast shadow
            when the light moved. With distance 0, far uses our fixed shadow-camera-far, which covers the
            whole scene so the shadow never gets cut, while staying tight enough for good depth precision. */}
        <spotLight ref={ref} position={pos} intensity={light.intensity} color={light.color}
          angle={light.angle ?? 0.6} penumbra={light.penumbra ?? 0.5}
          distance={light.distance ?? 0} decay={light.decay ?? 1.2}
          castShadow={!!light.castShadow} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003}
          shadow-normalBias={0.03} shadow-camera-near={0.5} shadow-camera-far={60} />
        <primitive object={target} />
      </>);
    default:
      return null;
  }
}

const hdriExt = (s: string) => { const m = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(s); return (m ? m[1] : '').toLowerCase(); };

// Render the equirect flat into an equirect-mapped HalfFloat RT, multiplied by `colorHex` (Colorize).
// HalfFloat + NoToneMapping keep the HDR range intact so the PMREM built from it still lights correctly.
function tintEquirect(gl: THREE.WebGLRenderer, tex: THREE.Texture, colorHex: string): THREE.WebGLRenderTarget {
  const W = tex.image.width, H = tex.image.height;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0, 1);
  const prevMapping = tex.mapping; tex.mapping = THREE.UVMapping; tex.needsUpdate = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(colorHex), toneMapped: false }));
  scene.add(mesh);
  const prevRT = gl.getRenderTarget(), prevTone = gl.toneMapping;
  gl.toneMapping = THREE.NoToneMapping;
  gl.setRenderTarget(rt); gl.clear(); gl.render(scene, cam);
  gl.setRenderTarget(prevRT); gl.toneMapping = prevTone;
  tex.mapping = prevMapping; tex.needsUpdate = true;
  mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  return rt;
}

// Image-based environment light (IBL). Loads the equirect HDRI with the loader matching its extension
// (.exr → EXRLoader, else RGBELoader for .hdr), PMREMs it, and drives scene.environment. We load it
// ourselves (rather than drei's <Environment>) so a runtime object URL from a file pick — which has no
// extension — still works, using `hdriName` to pick the loader.
//   • Effect A loads the equirect ONCE per url (kept in a ref) — colour/colorize changes never re-fetch.
//   • Effect B (re)builds the PMREM, tinting the source when Colorize is on.
//   • Intensity + Y rotation are cheap live writes each frame. Hidden via the eye toggle (unmounted).
function EnvNode({ light }: { light: Light }) {
  const { gl, scene } = useThree();
  const url = light.hdri;
  const ext = hdriExt(light.hdriName || url || '');
  const texRef = useRef<THREE.Texture | null>(null);
  const [loaded, setLoaded] = useState(0); // ticks when a new equirect finishes loading

  // A — load the raw equirect once per source.
  useEffect(() => {
    texRef.current = null;
    if (!url) { scene.environment = null; return; }
    let cancelled = false;
    const Loader = ext === 'exr' ? EXRLoader : RGBELoader;
    new Loader().load(url, tex => {
      if (cancelled) { tex.dispose(); return; }
      if (!hdriThumbs.has(url)) { try { makeHdriThumb(gl, tex, url); S().bump(); } catch { /* preview optional */ } }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      texRef.current = tex;
      setLoaded(n => n + 1);
    });
    return () => { cancelled = true; scene.environment = null; texRef.current?.dispose(); texRef.current = null; };
  }, [gl, scene, url, ext]);

  // B — build the PMREM (retinting when Colorize / colour change) without re-fetching.
  useEffect(() => {
    const tex = texRef.current; if (!tex) return;
    const pmrem = new THREE.PMREMGenerator(gl);
    const tinted = light.colorize ? tintEquirect(gl, tex, light.color) : null;
    const rt = pmrem.fromEquirectangular(tinted ? tinted.texture : tex);
    scene.environment = rt.texture;
    pmrem.dispose(); tinted?.dispose();
    return () => { scene.environment = null; rt.dispose(); };
  }, [gl, scene, loaded, light.colorize, light.color]);

  useFrame(() => {
    scene.environmentIntensity = light.intensity;
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(light.envRotation ?? 0), 0);
  });
  return null;
}

// Renders all store lights. Re-renders only when lights are added/removed/retyped (rev bump);
// per-frame value updates happen inside each LightNode's useFrame.
export default function SceneLights() {
  useStore(s => s.rev);
  const st = S();
  const lights = st.project.lights;
  const hidden = st.ui.hidden;
  // env is declarative (<Environment>), so it can't self-hide in useFrame like a LightNode — gate it
  // on the eye toggle here; other lights keep managing their own `visible` inside LightNode.
  return <>{lights.map(l => l.kind === 'env'
    ? (hidden[lightHideKey(l.id)] ? null : <EnvNode key={l.id} light={l} />)
    : <LightNode key={l.id + ':' + l.kind} light={l} />)}</>;
}