import * as THREE from 'three';
// Bridge between the r3f canvas and the DOM overlay (spline handles project from here).
export const R3: { cam: THREE.PerspectiveCamera | null; sceneCam: THREE.PerspectiveCamera | null; wrap: HTMLElement | null } = { cam: null, sceneCam: null, wrap: null };

// Screen-space marquee rectangle (wrap-relative px) drawn by the viewport selection tool, or null.
export const viewMarquee: { rect: { x: number; y: number; w: number; h: number } | null } = { rect: null };
