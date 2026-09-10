import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useStore, S } from '../store';
import { activeLight, setLightTargetObject } from '../lib/lights';

// Target picker: with the Target tool active, clicking an object (product / pedestal) in the
// viewport sets it as the camera's look-at target. Clicking empty space does nothing — a free
// look-at point is set via the POI channel (Transform), not here.
export default function TargetPicker() {
  const { gl, camera, scene } = useThree();
  useStore(s => s.rev);
  const active = S().ui.tool === 'target';

  useEffect(() => {
    if (!active) return;
    const dom = gl.domElement; const rc = new THREE.Raycaster();
    const down = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const targets: THREE.Object3D[] = [];
      scene.traverse(o => { if ((o as any).isMesh && o.userData.focusPickable) targets.push(o); });
      const hits = rc.intersectObjects(targets, false);
      if (!hits.length) return;
      let o: THREE.Object3D | null = hits[0].object; let objectId: string | undefined;
      while (o) { if (o.userData && o.userData.objectId) { objectId = o.userData.objectId; break; } o = o.parent; }
      if (!objectId) { S().toast('Cliquez un objet'); return; } // objects only — stay in picking mode
      // Route to whichever entity is being inspected: a selected light locks onto the object, else
      // the active camera does (original behaviour).
      if (S().ui.inspect === 'light' && activeLight()) {
        setLightTargetObject(objectId); S().toast('Light locked: ' + objectId);
        S().setTool('select'); // light gizmo shows on inspect==='light' regardless of tool
      } else {
        S().setTarget({ type: 'object', objectId }); S().toast('Target: ' + objectId);
        S().setTool('camera'); // one-shot: return to the Camera tool so the gizmo stays visible (Select hides it)
      }
    };
    dom.style.cursor = 'crosshair';
    dom.addEventListener('pointerdown', down);
    return () => { dom.removeEventListener('pointerdown', down); dom.style.cursor = ''; };
  }, [active, gl, camera, scene]);

  return null;
}
