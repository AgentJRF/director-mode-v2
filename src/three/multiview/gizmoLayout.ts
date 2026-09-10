import * as THREE from 'three';

// The multiview gizmos are single scene instances (so picking stays simple), but drei's PivotControls
// is screen-fixed: it looks the same size in every view regardless of zoom/distance. We reproduce that
// by rescaling the gizmo group to a constant pixel size *for the camera currently being rendered*,
// right before each quadrant's gl.render (and once for the clicked quadrant before hit-testing).
// POI reticles also billboard (face the view camera), matching the single-view screen-space handle.
export type GizmoEntry = { group: THREE.Object3D; sizePx: number; billboard: boolean };

export const mvGizmoEntries: GizmoEntry[] = [];
export function registerGizmo(e: GizmoEntry): () => void {
  mvGizmoEntries.push(e);
  return () => { const i = mvGizmoEntries.indexOf(e); if (i >= 0) mvGizmoEntries.splice(i, 1); };
}

const _p = new THREE.Vector3();
// world units per screen pixel at the gizmo's location, for the given camera + quadrant pixel height
function worldPerPx(cam: THREE.Camera, at: THREE.Vector3, pxHeight: number): number {
  const oc = cam as THREE.OrthographicCamera;
  if (oc.isOrthographicCamera) return (oc.top - oc.bottom) / Math.max(1, pxHeight);
  const pc = cam as THREE.PerspectiveCamera;
  const dist = pc.position.distanceTo(at);
  return 2 * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) * dist / Math.max(1, pxHeight);
}

export function layoutGizmosForView(cam: THREE.Camera, pxHeight: number): void {
  for (const e of mvGizmoEntries) {
    if (!e.group.parent) continue;
    e.group.getWorldPosition(_p);
    const s = Math.max(1e-4, e.sizePx * worldPerPx(cam, _p, pxHeight));
    e.group.scale.setScalar(s);
    if (e.billboard) e.group.quaternion.copy(cam.quaternion); // face the view camera
    e.group.updateWorldMatrix(false, true);
  }
}
