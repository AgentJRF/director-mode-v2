import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useStore, S, PIVOT } from '../store';
import type { Vec3 } from '../types';

// Focus tool (triggered from the Inspector, not a permanent mode). While picking,
// clicking the asset sets the DoF focus to that world point. The reticle is a crisp
// DOM overlay (drei <Html>) — never blurred by DoF, constant screen size.
export default function FocusPicker() {
  const { gl, camera, scene } = useThree();
  useStore(s => s.rev);
  const picking = S().ui.focusPicking;

  useEffect(() => {
    if (!picking) return;
    const dom = gl.domElement; const rc = new THREE.Raycaster();
    const down = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const targets: THREE.Object3D[] = [];
      scene.traverse(o => { if ((o as any).isMesh && o.userData.focusPickable) targets.push(o); });
      const hits = rc.intersectObjects(targets, false);
      if (hits.length) {
        const p = hits[0].point;
        S().setFocusPoint([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)] as Vec3);
      }
      S().setFocusPicking(false);
    };
    dom.style.cursor = 'crosshair';
    dom.addEventListener('pointerdown', down);
    return () => { dom.removeEventListener('pointerdown', down); dom.style.cursor = ''; };
  }, [picking, gl, camera, scene]);

  if (!picking) return null;
  const fp = S().active().optics.focusPoint;
  const pos = (fp ?? (PIVOT.toArray() as Vec3));
  return (
    <Html position={pos} center zIndexRange={[20, 20]} style={{ pointerEvents: 'none' }}>
      <div className="focus-reticle" />
    </Html>
  );
}
