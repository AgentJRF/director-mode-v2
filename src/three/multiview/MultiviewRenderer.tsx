import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { PIVOT, S } from '../../store';
import { keysOf } from '../../lib/eval';
import type { Vec3 } from '../../types';
import { orthoState, configOrtho, orthoCams } from './views';
import { layoutGizmosForView } from './gizmoLayout';
import useMultiviewInput from './useMultiviewInput';

// Takes over the render loop (useFrame priority 1 disables r3f auto-render) and paints the single
// shared scene into four scissored quadrants with four cameras. Mounted only while multiview is on;
// on unmount, r3f resumes normal single-camera rendering.
export default function MultiviewRenderer({ sceneCamRef }: { sceneCamRef: RefObject<THREE.PerspectiveCamera | null> }) {
  const { gl, scene, size } = useThree();
  const orthos = orthoCams;
  useMultiviewInput(sceneCamRef);

  // frame the ortho views to fit the whole path (+ product) once on entry, so every keyframe/handle
  // is reachable. The user can pan/zoom afterwards.
  useEffect(() => {
    const pts: Vec3[] = keysOf(S().active(), 'position').map(k => k.value as Vec3);
    // include the product/pedestal footprint around the pivot
    const pad: Vec3[] = [[PIVOT.x - 1.6, 0, PIVOT.z - 1.6], [PIVOT.x + 1.6, 2.2, PIVOT.z + 1.6]];
    const all = pts.length ? pts.concat(pad) : pad;
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of all) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
    const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const span: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const aspect = Math.max(0.2, size.width / size.height); // each quad shares the canvas aspect
    const fit = (vSpan: number, hSpan: number) => Math.max(0.8, Math.max(vSpan / 2, hSpan / (2 * aspect)) * 1.25);
    orthoState.top.center.set(c[0], 0, c[2]); orthoState.top.halfHeight = fit(span[2], span[0]);      // vertical=Z, horizontal=X
    orthoState.front.center.set(c[0], c[1], 0); orthoState.front.halfHeight = fit(span[1], span[0]);   // vertical=Y, horizontal=X
    orthoState.side.center.set(0, c[1], c[2]); orthoState.side.halfHeight = fit(span[1], span[2]);     // vertical=Y, horizontal=Z
  }, [size.width, size.height]);

  // restore full viewport / scissor state when leaving multiview
  useEffect(() => () => {
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.setScissor(0, 0, size.width, size.height);
    gl.autoClear = true;
  }, [gl, size.width, size.height]);

  useFrame(() => {
    const persp = sceneCamRef.current; if (!persp) return;
    const w = size.width, h = size.height;
    const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
    const aspect = hw / hh;

    configOrtho(orthos.top, 'top', aspect);
    configOrtho(orthos.front, 'front', aspect);
    configOrtho(orthos.side, 'side', aspect);
    // OrbitControls is disabled in multiview, so aim the perspective quad at the pivot ourselves
    // (fixed 3/4 overview for now; interactive orbit is a later refinement).
    persp.position.set(PIVOT.x + 7, PIVOT.y + 5.5, PIVOT.z + 9);
    persp.lookAt(PIVOT.x, PIVOT.y, PIVOT.z);
    persp.aspect = aspect; persp.updateProjectionMatrix(); persp.updateMatrixWorld(true);

    gl.autoClear = false;
    gl.setScissorTest(false);
    gl.clear(); // clear whole framebuffer once (scissor off)
    gl.setScissorTest(true);
    // The scene fog (tuned for the close camera POV) would fully hide meshes seen by the ortho
    // cameras, which sit ~200 units away. Disable it for the editor quad, restore after.
    const fog = scene.fog; scene.fog = null;

    // GL viewport origin is bottom-left → top row sits at y=hh, bottom row at y=0.
    const quads: [THREE.Camera, number, number][] = [
      [persp, 0, hh],        // TL  Perspective
      [orthos.top, hw, hh],  // TR  Top
      [orthos.front, 0, 0],  // BL  Front
      [orthos.side, hw, 0],  // BR  Side
    ];
    for (const [cam, x, y] of quads) {
      gl.setViewport(x, y, hw, hh);
      gl.setScissor(x, y, hw, hh);
      layoutGizmosForView(cam, hh); // screen-fixed size + billboard, for THIS quadrant's camera
      gl.render(scene, cam);
    }

    scene.fog = fog;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, w, h);
    gl.autoClear = true;
  }, 1);

  return null;
}
