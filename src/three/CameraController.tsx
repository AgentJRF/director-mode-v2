import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { PIVOT, S } from '../store';
import { evaluate, poseToSpherical, sphericalToPose, eulerFromLookAt, clamp } from '../lib/eval';
import { R3 } from './shared';
import type { Vec3 } from '../types';

// Drives the render camera from the store, and (in 'camera' view) lets orbit compose it.
export default function CameraController({ renderCamRef }: { renderCamRef: RefObject<THREE.PerspectiveCamera | null> }) {
  const { gl } = useThree();
  const dragging = useRef(false);
  const sph = useRef({ r: 8, theta: 0, phi: 1 });
  const pending = useRef<Vec3 | null>(null);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const dom = gl.domElement;
    // Camera view is a pure preview ("what the camera sees") — no orbit/dolly here; the camera is
    // composed/edited in the Scene view (OrbitControls + gizmo). Prevents accidentally re-posing an
    // animated shot by dragging in the POV.
    const canOrbit = () => false;
    const down = (e: PointerEvent) => {
      if (!canOrbit()) return;
      dragging.current = true; last.current = { x: e.clientX, y: e.clientY };
      sph.current = poseToSpherical(evaluate(S().active(), S().project.timeline.playhead).position, PIVOT);
      dom.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = (e.clientX - last.current.x) / 220, dy = (e.clientY - last.current.y) / 260;
      last.current = { x: e.clientX, y: e.clientY };
      sph.current.theta -= dx; sph.current.phi = clamp(sph.current.phi - dy, 0.12, Math.PI - 0.12);
      pending.current = sphericalToPose(sph.current, PIVOT);
    };
    const up = () => {
      if (!dragging.current) return; dragging.current = false;
      if (pending.current) { const p = pending.current; S().commitPose(p, eulerFromLookAt(p, PIVOT.toArray() as Vec3)); pending.current = null; }
    };
    const wheel = (e: WheelEvent) => {
      if (!canOrbit()) return; e.preventDefault();
      const sp = poseToSpherical(evaluate(S().active(), S().project.timeline.playhead).position, PIVOT);
      sp.r = clamp(sp.r * (1 + e.deltaY * 0.0011), 2, 40);
      const p = sphericalToPose(sp, PIVOT); S().commitPose(p, eulerFromLookAt(p, PIVOT.toArray() as Vec3));
    };
    dom.addEventListener('pointerdown', down); dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    return () => {
      dom.removeEventListener('pointerdown', down); dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up); dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const st = S(); const tl = st.project.timeline;
    if (tl.playing) { let t = tl.playhead + dt; if (t >= tl.duration) { t = tl.duration; st.setPlaying(false); } tl.playhead = t; st.bump(); }
    const cam = st.renderCamera(); // follows the on-air camera during playback (multi-camera cuts)
    const c = renderCamRef.current; if (!c) return;
    const p = evaluate(cam, tl.playhead);
    if (dragging.current && pending.current && st.ui.viewMode === 'camera') {
      c.position.set(...pending.current); c.lookAt(PIVOT);
    } else {
      c.position.set(...p.position);
      const e = p.rotation.map(THREE.MathUtils.degToRad);
      c.rotation.set(e[0], e[1], e[2], 'YXZ');
    }
    c.filmGauge = 36; c.setFocalLength(p.focalLength);
    c.aspect = st.project.canvas.width / st.project.canvas.height;
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    R3.cam = c;
  });

  return null;
}
