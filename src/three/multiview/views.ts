import * as THREE from 'three';

// Quad layout (2×2), top-left origin (DOM/client coords):
//   Perspective (TL) | Top   (TR)
//   Front       (BL) | Side  (BR)
export type ViewId = 'persp' | 'top' | 'front' | 'side';
export type OrthoId = 'top' | 'front' | 'side';

// Interactive framing per ortho view (module state — mutated by input, read by the renderer).
export interface OrthoState { center: THREE.Vector3; halfHeight: number; }
export const orthoState: Record<OrthoId, OrthoState> = {
  top: { center: new THREE.Vector3(0, 0, 0), halfHeight: 8 },
  front: { center: new THREE.Vector3(0, 1, 0), halfHeight: 8 },
  side: { center: new THREE.Vector3(0, 1, 0), halfHeight: 8 },
};

// Ortho cameras are module singletons so the renderer and the input controller share them
// (the renderer configures them each frame; input reads their current matrices for picking).
export const orthoCams: Record<OrthoId, THREE.OrthographicCamera> = {
  top: new THREE.OrthographicCamera(), front: new THREE.OrthographicCamera(), side: new THREE.OrthographicCamera(),
};

export interface SubRect { left: number; top: number; w: number; h: number; }

// Sub-rect (client coords) of a given view in the fixed 2×2 layout.
export function subRectFor(viewId: ViewId, rect: DOMRect): SubRect {
  const halfW = rect.width / 2, halfH = rect.height / 2;
  const col = viewId === 'persp' || viewId === 'front' ? 0 : 1;
  const row = viewId === 'persp' || viewId === 'top' ? 0 : 1;
  return { left: rect.left + col * halfW, top: rect.top + row * halfH, w: halfW, h: halfH };
}

// Which quadrant a client point falls in, plus that quadrant's sub-rect (client coords).
export function quadrantFor(clientX: number, clientY: number, rect: DOMRect): { viewId: ViewId; sub: SubRect } {
  const halfW = rect.width / 2, halfH = rect.height / 2;
  const col = clientX - rect.left < halfW ? 0 : 1;
  const row = clientY - rect.top < halfH ? 0 : 1;
  const viewId: ViewId = row === 0 ? (col === 0 ? 'persp' : 'top') : (col === 0 ? 'front' : 'side');
  return { viewId, sub: { left: rect.left + col * halfW, top: rect.top + row * halfH, w: halfW, h: halfH } };
}

// Normalized device coords WITHIN a sub-rect (DPR-independent).
export function ndcInSub(clientX: number, clientY: number, sub: SubRect): THREE.Vector2 {
  return new THREE.Vector2(((clientX - sub.left) / sub.w) * 2 - 1, -((clientY - sub.top) / sub.h) * 2 + 1);
}

const CAM_DIST = 200;
// Configure an orthographic camera for a view, from its state and the quadrant aspect.
export function configOrtho(cam: THREE.OrthographicCamera, id: OrthoId, aspect: number) {
  const { center: c, halfHeight: hH } = orthoState[id];
  cam.left = -hH * aspect; cam.right = hH * aspect; cam.top = hH; cam.bottom = -hH; cam.near = 0.1; cam.far = 2 * CAM_DIST + 100;
  if (id === 'top') { cam.position.set(c.x, CAM_DIST, c.z); cam.up.set(0, 0, -1); cam.lookAt(c.x, 0, c.z); }
  else if (id === 'front') { cam.position.set(c.x, c.y, CAM_DIST); cam.up.set(0, 1, 0); cam.lookAt(c.x, c.y, 0); }
  else { cam.position.set(CAM_DIST, c.y, c.z); cam.up.set(0, 1, 0); cam.lookAt(0, c.y, c.z); }
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
}

// Drag plane + which value axes a view edits (for keyframe/handle dragging).
// persp is handled separately (horizontal plane, or camera-facing vertical plane on Shift).
export function planeAndAxesFor(id: OrthoId, kv: readonly [number, number, number]): { plane: THREE.Plane; axes: [number, number] } {
  if (id === 'top') return { plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -kv[1]), axes: [0, 2] };   // X/Z
  if (id === 'front') return { plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -kv[2]), axes: [0, 1] };  // X/Y
  return { plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), -kv[0]), axes: [1, 2] };                       // Y/Z (side)
}
