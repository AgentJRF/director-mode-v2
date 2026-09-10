import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore, S } from '../store';
import { round, poiPoint } from '../lib/eval';
import type { Vec3 } from '../types';

// After-Effects-style Point of Interest control: a small crosshair at the look-at point,
// shown permanently. Dragging it defines/moves the point the camera looks at.
export default function PoiControl() {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const plane = useMemo(() => new THREE.Plane(), []);
  const rc = useMemo(() => new THREE.Raycaster(), []);
  useStore(s => s.rev);
  const cam = S().active();
  const poi = poiPoint(cam, S().project.timeline.playhead);
  // an object target owns the aim → POI (and orientation) are locked, so the handle is not draggable
  const locked = cam.target?.type === 'object';

  const move = (clientX: number, clientY: number) => {
    const r = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, camera); const p = new THREE.Vector3();
    if (rc.ray.intersectPlane(plane, p)) {
      // aimAt keeps a FREE camera free (writes/animates rotation); moves the point for a point target.
      S().aimAt([round(p.x, 3), round(p.y, 3), round(p.z, 3)] as Vec3);
    }
  };

  return (
    <Html position={poi} center zIndexRange={[30, 30]} style={{ pointerEvents: locked ? 'none' : 'auto' }}>
      <div className={'poi-handle' + (locked ? ' locked' : '')}
        title={locked ? 'Point of interest — locked to the object target' : 'Point of interest — drag to aim the camera'}
        onPointerDown={e => {
          e.stopPropagation();
          if (locked) return; // object target owns the aim — do not convert to a free point
          // NB: do NOT create a target here. A free camera stays free — dragging aims it via rotation
          // (see store.aimAt), so rotation remains manually animatable.
          const n = camera.getWorldDirection(new THREE.Vector3()).negate();
          plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...poi));
          dragging.current = true; S().setGizmoDragging(true);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => { if (dragging.current) move(e.clientX, e.clientY); }}
        onPointerUp={e => { dragging.current = false; S().setGizmoDragging(false); (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); }}
      />
    </Html>
  );
}
