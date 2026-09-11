// Director mode — data model (from the brief)
export type Vec3 = [number, number, number];
// 'intensity' is a LIGHT channel (a plain number), added so lights can reuse the Keyframe unit.
// Cameras never carry intensity keys, so the camera eval path is unaffected.
export type Channel = 'position' | 'rotation' | 'focalLength' | 'poi' | 'aperture' | 'motionBlur' | 'intensity';
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInOutStrong';
export type KeySource = 'manual' | 'preset' | 'interpolation' | 'aiVideo' | 'aiLight';

export interface Keyframe {
  id: string;
  time: number;                 // seconds
  channel: Channel;
  value: Vec3 | number;         // Vec3 for position/rotation/poi, number for focalLength/intensity
  ease: Ease;                   // curve ENTERING this key
  source: KeySource;
  // Bézier tangents for the position channel — offsets (world units) relative to `value`.
  // Undefined = auto (1/3 of the chord to the neighbour) → straight segment.
  tangentIn?: Vec3;             // control handle for the segment ARRIVING at this key
  tangentOut?: Vec3;            // control handle for the segment LEAVING this key
}

export interface Target {
  type: 'object' | 'point';
  objectId?: string;
  point?: Vec3;
}

export interface Camera {
  id: string;
  name: string;
  color: string;                // track / gizmo colour (hex)
  transform: { position: Vec3; rotation: Vec3 };
  optics: { focalLength: number; aperture: number; motionBlurShutter: number; focusPoint?: Vec3 | null };
  target: Target | null;
  keyframes: Keyframe[];
  // On-air time window on the global timeline (multi-camera cuts). Undefined = spans the whole timeline.
  clip?: { start: number; end: number };
}

// ───────────────────────────────────────────────────────────────────────────
// LIGHTS — first-class scene entities, siblings of Camera. A spot/directional
// AIMS exactly like a camera with a POI, so it reuses `Target` + the look-at
// machinery. Animatable channels (position / poi / intensity) reuse `Keyframe`,
// so lights land on the SAME timeline as cameras and inherit undo/redo for free.
// ───────────────────────────────────────────────────────────────────────────
export type LightKind = 'spot' | 'directional' | 'point' | 'ambient' | 'hemisphere' | 'area' | 'env';

// Physical occluder projected by a spot (the auto-lighting "gobo").
export interface LightGobo {
  enabled: boolean;
  sharpness: number;            // shadow edge hardness
  size: number;                 // occluder scale multiplier
  rotation: number;             // spin around the light→target axis (radians)
}

export interface Light {
  id: string;
  name: string;
  kind: LightKind;
  color: string;                // hex — for hemisphere this is the SKY colour
  groundColor?: string;         // hemisphere only (ground hemisphere colour)
  intensity: number;
  transform: { position: Vec3; rotation: Vec3 };
  target: Target | null;        // spot/directional aim (look-at) — same type as Camera.target
  // spot / point optics (undefined for ambient/hemisphere)
  angle?: number;               // spot cone half-angle (radians)
  penumbra?: number;            // spot edge softness 0..1
  distance?: number;            // spot/point falloff distance (0 = no limit)
  decay?: number;               // physical falloff exponent
  width?: number;               // area (RectAreaLight) emitter width
  height?: number;              // area (RectAreaLight) emitter height
  gobo?: LightGobo;             // spot occluder
  castShadow?: boolean;
  // env (image-based environment light / IBL) only:
  hdri?: string;                // URL to the equirect map — a public path or a runtime object URL
  hdriName?: string;            // original filename (display + extension → loader choice for object URLs)
  envRotation?: number;         // spin the environment around Y (degrees)
  colorize?: boolean;           // tint the environment by `color`
  keyframes: Keyframe[];        // animatable: 'position' (Vec3), 'poi' (Vec3), 'intensity' (number)
}

export type Tool = 'select' | 'camera' | 'target' | 'light';

export interface Project {
  cameras: Camera[];
  lights: Light[];              // NEW — scene lights (seeded with the default studio rig)
  activeCameraId: string;
  activeLightId: string;        // NEW — '' when no light is selected
  fps: number;
  timeline: { duration: number; playhead: number; playing: boolean };
  canvas: { width: number; height: number };
}