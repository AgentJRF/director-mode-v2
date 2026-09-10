// Client-side AI match (image + video), Wizard-of-Oz. Runs WITHOUT the Vite dev server so the demo
// works on a static host (Vercel). Order for each: baked pose (by file-name substring) → dev-server
// endpoint (real Claude vision in `npm run dev`; absent on a static build) → local heuristic.
import type { Vec3, Ease } from '../types';

// ---- image (camera pose) --------------------------------------------------
export type ExactPose = { position: Vec3; rotation: Vec3; focal: number; aperture: number; focusPoint: Vec3 | null };
export type CameraEstimate = {
  azimuth_deg: number; elevation_deg: number; distance_factor: number; focal_mm: number;
  aperture_f: number; confidence: number; reasoning: string; mocked?: boolean; pose?: ExactPose;
};

const GILL_DUFFEL: CameraEstimate = {
  azimuth_deg: -62, elevation_deg: 10, distance_factor: 3.37, focal_mm: 40, aperture_f: 8, confidence: 0.9,
  reasoning: 'Cylindrical holdall in 3/4 from a near eye-level angle: circular end large to camera-left, body receding right. Wide ~40mm framing, deep focus (even product lighting, minimal bokeh).',
  mocked: false,
};
const ORANGE_DETAIL: CameraEstimate = {
  azimuth_deg: -7, elevation_deg: 64, distance_factor: 1.1, focal_mm: 37, aperture_f: 1.4, confidence: 0.85,
  reasoning: 'Macro detail: high, close top-down on the zip line; shallow depth (f/1.4) → strong bokeh, ~37mm.',
  mocked: false,
  pose: { position: [-0.11, 3.27, 0.94], rotation: [-50.45, -8.45, 6.34], focal: 37, aperture: 1.4, focusPoint: [0.12, 1.3, -0.67] },
};
const ORANGE_ZIP_FRONT: CameraEstimate = {
  azimuth_deg: 7, elevation_deg: 59, distance_factor: 1.3, focal_mm: 50, aperture_f: 1.4, confidence: 0.88,
  reasoning: 'Frontal macro on the zip line: close and slightly high, shallow depth (f/1.4) → strong bokeh on the handles/background, ~50mm.',
  mocked: false,
  pose: { position: [0.15, 3.06, 1.29], rotation: [-36.52, 7.6, -4.46], focal: 50, aperture: 1.4, focusPoint: [0.01, 2.032, -0.02] },
};
// order matters: `find` returns the FIRST match → specific keys before generic ones.
const CAMERA_DEMO: [string, CameraEstimate][] = [
  ['lining', ORANGE_ZIP_FRONT],
  ['gill', GILL_DUFFEL], ['duffel', GILL_DUFFEL], ['holdall', GILL_DUFFEL],
  ['orange', ORANGE_DETAIL], ['zip', ORANGE_DETAIL], ['detail', ORANGE_DETAIL], ['macro', ORANGE_DETAIL],
];
function imageHeuristic(w?: number, h?: number): CameraEstimate {
  const ar = (w || 1) / (h || 1);
  const focal = ar < 0.85 ? 85 : ar > 1.5 ? 28 : 50;
  return { azimuth_deg: 32, elevation_deg: 12, distance_factor: 2.6, focal_mm: focal, aperture_f: 2.8, confidence: 0.4,
    reasoning: 'Heuristic estimate — no baked match and no AI backend on this host. Adjust the sliders to taste.', mocked: true };
}

export async function matchCamera(p: { name?: string; width?: number; height?: number; imageBase64?: string; mediaType?: string }): Promise<CameraEstimate> {
  const name = (p.name || '').toLowerCase();
  const demo = CAMERA_DEMO.find(([k]) => name.includes(k));
  if (demo) return demo[1];
  const dev = await tryJson('/api/match-camera', p);
  return (dev as CameraEstimate) ?? imageHeuristic(p.width, p.height);
}

// ---- video (camera move) --------------------------------------------------
export type MotionStepT = { az: number; el: number; dist: number; focal: number; aperture: number };
export type MotionKeyT = { t: number; pos: Vec3; ease: Ease; tOut?: Vec3; tIn?: Vec3 };
export type MotionExactT = { target: Vec3 | null; focal: number; aperture: number; duration: number; keys: MotionKeyT[] };
export type MotionEstimateT = {
  gesture: string; duration: number; ease: Ease; start: MotionStepT; end: MotionStepT;
  confidence: number; reasoning: string; mocked?: boolean; exact?: MotionExactT;
};

const COFFEE_REVEAL: MotionEstimateT = {
  gesture: 'push-out + crane-up (tight → wide)', duration: 1.73, ease: 'easeInOut',
  start: { az: 0, el: 6, dist: 2.1, focal: 50, aperture: 4 },
  end: { az: 0, el: 20, dist: 3.6, focal: 50, aperture: 4 },
  confidence: 0.83,
  reasoning: 'Face-on reveal that opens up: starts tight at a near eye-level hero framing, then cranes up and pulls back to a wider view at a gentle high angle; the product stays centered and straight-front (no orbit). ~1.7s.',
  mocked: false,
  exact: {
    target: [0, 1.5, 0], focal: 50, aperture: 4, duration: 1.73,
    keys: [
      { t: 0, pos: [0, 1.704, 5.418], ease: 'linear', tOut: [0.012, -0.052, 1.064] },
      { t: 1.73, pos: [0, 3.777, 7.71], ease: 'easeInOut', tIn: [0.002, -1.125, -0.042] },
    ],
  },
};
const MOTION_DEMO: [string, MotionEstimateT][] = [
  ['coffee', COFFEE_REVEAL], ['machine', COFFEE_REVEAL], ['packshot', COFFEE_REVEAL],
];
function motionHeuristic(): MotionEstimateT {
  return {
    gesture: 'orbital reveal', duration: 3, ease: 'easeInOut',
    start: { az: -35, el: 18, dist: 3.0, focal: 50, aperture: 4 },
    end: { az: 35, el: 12, dist: 2.6, focal: 50, aperture: 4 },
    confidence: 0.4,
    reasoning: 'Heuristic motion — no baked match for this clip. Defaulting to a gentle orbital reveal (baked camera moves are keyed by file name).',
    mocked: true,
  };
}

export async function matchMotion(name: string): Promise<MotionEstimateT> {
  const n = (name || '').toLowerCase();
  const demo = MOTION_DEMO.find(([k]) => n.includes(k));
  if (demo) return demo[1];
  const dev = await tryJson('/api/match-motion', { name });
  return (dev as MotionEstimateT) ?? motionHeuristic();
}

// Try the dev-server endpoint; returns null on a static host (no endpoint → HTML/404/network error).
async function tryJson(url: string, body: unknown): Promise<unknown> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('application/json')) return await r.json();
  } catch { /* no dev server (static deploy) */ }
  return null;
}
