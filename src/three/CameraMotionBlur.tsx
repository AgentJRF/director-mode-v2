import { Effect, EffectAttribute } from 'postprocessing';
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { S } from '../store';
import { evaluate } from '../lib/eval';

const d2r = THREE.MathUtils.degToRad;

// Directional screen-space blur, sampled symmetrically along uDir (UV units).
const frag = /* glsl */`
uniform vec2 uDir;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  const int N = 12;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < N; i++) {
    float t = float(i) / float(N - 1) - 0.5;      // -0.5 .. 0.5
    sum += texture2D(inputBuffer, uv + uDir * t);
  }
  outputColor = sum / float(N);
}`;

class MotionBlurEffect extends Effect {
  constructor() {
    // CONVOLUTION → its own pass reading the PREVIOUS effect's output via inputBuffer (so it composes
    // ON TOP of DepthOfField instead of being merged and discarding the DoF result).
    super('CameraMotionBlur', frag, { attributes: EffectAttribute.CONVOLUTION, uniforms: new Map([['uDir', new THREE.Uniform(new THREE.Vector2(0, 0))]]) });
  }
}

// Live camera motion-blur approximation. The blur vector comes from the camera's ANGULAR change over
// the exposure window (shutter/360 ÷ fps): a yaw/pitch delta shifts the whole image uniformly, so it
// stays visible even when the camera tracks a subject (orbit/pan/tilt). Pure dolly (no rotation) →
// little blur (its blur is radial, out of scope). Global On/Off + non-animatable shutter.
export default function CameraMotionBlur() {
  const effect = useMemo(() => new MotionBlurEffect(), []);
  const { camera } = useThree();

  useFrame(() => {
    const dir = effect.uniforms.get('uDir')!.value as THREE.Vector2;
    if (!S().ui.motionBlur) { dir.set(0, 0); return; }
    const cam = S().active(); const proj = S().project; const t = proj.timeline.playhead;
    const shutter = cam.optics.motionBlurShutter;
    const fps = proj.fps || 30;
    const exposure = (shutter / 360) / fps;
    const t2 = Math.min(t + exposure, proj.timeline.duration);
    if (shutter <= 0.5 || t2 <= t) { dir.set(0, 0); return; }

    const pc = camera as THREE.PerspectiveCamera;
    const p2 = evaluate(cam, t2);
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(p2.rotation[0]), d2r(p2.rotation[1]), d2r(p2.rotation[2]), 'YXZ'));
    const dq = q2.multiply(pc.quaternion.clone().invert());   // camera rotation from t → t2
    const e = new THREE.Euler().setFromQuaternion(dq, 'YXZ'); // yaw = e.y, pitch = e.x

    const fovV = pc.fov * Math.PI / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * pc.aspect);
    const GAIN = 2.2, MAX = 0.03;
    let ux = -(e.y / (fovH / 2)) * 0.5 * GAIN;  // yaw → horizontal smear
    let uy = (e.x / (fovV / 2)) * 0.5 * GAIN;   // pitch → vertical smear
    const mag = Math.hypot(ux, uy);
    if (mag > MAX) { ux *= MAX / mag; uy *= MAX / mag; }
    dir.set(ux, uy);
  });

  return <primitive object={effect} dispose={null} />;
}
