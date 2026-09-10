import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { R3 } from './shared';
import { S } from '../store';
import { poiPoint } from '../lib/eval';
import type { Vec3 } from '../types';

// Camera-mode overlay. The camera path (line + handles) is intentionally NOT drawn here:
// in the camera POV we want a clean final framing. Path editing lives in Scene view
// (draggable 3D spheres in SceneGizmos). Only the POI aim crosshair is shown as a guide.
export default function SplineOverlay() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let raf = 0;
    const project = (v: Vec3) => {
      const cam = R3.cam!, wrap = R3.wrap!;
      const p = new THREE.Vector3(...v).project(cam);
      return { x: (p.x * 0.5 + 0.5) * wrap.clientWidth, y: (-p.y * 0.5 + 0.5) * wrap.clientHeight, z: p.z };
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const svg = svgRef.current, cam = R3.cam, wrap = R3.wrap; if (!svg || !cam || !wrap) return;
      const st = S();
      if (st.ui.viewMode !== 'camera') { if (svg.innerHTML) svg.innerHTML = ''; return; }
      svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
      const c = st.active(); let out = '';
      if (c.target && c.target.type === 'point') {
        const s = project(poiPoint(c, st.project.timeline.playhead));
        if (s.z < 1) out += `<g><circle cx="${s.x}" cy="${s.y}" r="10" fill="none" stroke="#5b9dd9" stroke-width="1.5"/><line x1="${s.x - 14}" y1="${s.y}" x2="${s.x + 14}" y2="${s.y}" stroke="#5b9dd9"/><line x1="${s.x}" y1="${s.y - 14}" x2="${s.x}" y2="${s.y + 14}" stroke="#5b9dd9"/></g>`;
      }
      svg.innerHTML = out;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <svg id="overlay-svg" ref={svgRef} preserveAspectRatio="none" />;
}
