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
  if (kind === 'directional') base.castShadow = true;
  if (kind === 'area') { base.width = 3; base.height = 3; base.intensity = 5; base.castShadow = true; }
  if (kind === 'env') { base.envRotation = 0; base.colorize = false; } // image-based environment (IBL)
  return { ...base, ...over };
}

// Stable hidden-map key for a light (mirrors the 'cam:'+id convention used for cameras).
export const lightHideKey = (id: string) => 'light:' + id;