import type { Light, LightKind } from '../types';
import { uid } from './eval';

// Factory with sensible per-kind defaults. Callers override what they need (position, colour…).
export function makeLight(kind: LightKind, name: string, over: Partial<Light> = {}): Light {
  const base: Light = {
    id: uid(), name, kind,
    color: '#ffffff', intensity: 1,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
    target: null, keyframes: [],
  };
  if (kind === 'spot') {
    // distance 0 = unlimited (decay attenuates) so the shadow-map far plane isn't clipped — see SceneLights.
    base.angle = 0.6; base.penumbra = 0.5; base.distance = 0; base.decay = 1.2; base.castShadow = true;
  }
  if (kind === 'point') { base.distance = 40; base.decay = 1.2; }
  if (kind === 'area') { base.width = 3; base.height = 3; base.intensity = 5; }
  if (kind === 'env') { base.envRotation = 0; base.colorize = false; } // image-based environment (IBL)
  return { ...base, ...over };
}

// The DEFAULT studio rig — a 1:1 port of the hardcoded <Lights> in Scene.tsx, so promoting lights to
// data leaves the out-of-the-box render pixel-identical. Order = z-order in the Outliner list.
//   ambient(0.55,#d8dee6) · hemisphere(#6b7480/#2a2f35,1.0) · key spot · fill / rim / front directionals
// The three directionals keep target=null → three.js aims them at the world origin, exactly as today.
export function makeDefaultLights(): Light[] {
  return [
    makeLight('ambient', 'Ambient', { color: '#d8dee6', intensity: 0.55 }),
    makeLight('hemisphere', 'Sky / Ground', { color: '#6b7480', groundColor: '#2a2f35', intensity: 1.0 }),
    makeLight('spot', 'Key', {
      color: '#fff4e6', intensity: 4.6,
      transform: { position: [6, 9, 6], rotation: [0, 0, 0] },
      angle: 0.85, penumbra: 0.5, distance: 0, decay: 1.2, castShadow: true,
    }),
    makeLight('directional', 'Fill', {
      color: '#9fb4cc', intensity: 0.8, transform: { position: [-7, 4, -3], rotation: [0, 0, 0] },
    }),
    makeLight('directional', 'Rim', {
      color: '#bcd0ff', intensity: 1.0, transform: { position: [-3, 6, -8], rotation: [0, 0, 0] },
    }),
    makeLight('directional', 'Front', {
      color: '#f2f2f6', intensity: 1.0, transform: { position: [5, 4, 9], rotation: [0, 0, 0] },
    }),
  ];
}

// Stable hidden-map key for a light (mirrors the 'cam:'+id convention used for cameras).
export const lightHideKey = (id: string) => 'light:' + id;