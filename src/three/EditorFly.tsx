import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Keyboard fly navigation for the Scene (editor) view: WASD / arrows to move on the
// ground plane, Q/E down/up. Moves both the camera and the OrbitControls target so
// rotate/zoom keep working around the new position.
export default function EditorFly() {
  const { camera } = useThree();
  const controls = useThree(s => s.controls) as any;
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const isField = (t: any) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    const wanted = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    // Ignore when a modifier is held so app shortcuts (Ctrl+Z undo, etc.) don't drive the fly camera —
    // on AZERTY the physical `KeyW` (fly-forward) is the "Z" key, so Ctrl+Z would otherwise advance.
    const dn = (e: KeyboardEvent) => { if (e.ctrlKey || e.metaKey || e.altKey || isField(e.target) || !wanted.includes(e.code)) return; keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); keys.current = {}; };
  }, []);

  useFrame((_, dt) => {
    const k = keys.current;
    let f = 0, r = 0, u = 0;
    if (k['KeyW'] || k['ArrowUp']) f += 1;
    if (k['KeyS'] || k['ArrowDown']) f -= 1;
    if (k['KeyD'] || k['ArrowRight']) r += 1;
    if (k['KeyA'] || k['ArrowLeft']) r -= 1;
    if (k['KeyE']) u += 1;
    if (k['KeyQ']) u -= 1;
    if (!f && !r && !u) return;
    const dist = controls ? camera.position.distanceTo(controls.target) : 10;
    const speed = Math.max(2.5, dist) * dt * 1.3;
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1); forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3()
      .addScaledVector(forward, f * speed)
      .addScaledVector(right, r * speed);
    move.y += u * speed;
    camera.position.add(move);
    if (controls) { controls.target.add(move); controls.update(); }
  });

  return null;
}
