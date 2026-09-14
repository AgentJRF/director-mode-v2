import * as THREE from 'three';
import type { GoboPattern, LightGobo } from '../types';

// Gobo / light-cookie textures. Geometric patterns are drawn procedurally on a canvas (crisp at any
// size, no assets to ship); 'custom' loads an uploaded image (e.g. an Adobe Stock gobo). The texture
// is a grayscale MASK: white = light passes, dark = blocked. It's fed to spotLight.map (see SceneLights)
// which projects it across the cone. size (repeat) + rotation are applied live on the texture transform;
// sharpness + contrast are baked into the canvas, so only those (and the pattern) trigger a rebuild.

export const GOBO_PATTERNS: { id: GoboPattern; label: string }[] = [
  { id: 'blinds', label: 'Blinds' },
  { id: 'window', label: 'Window' },
  { id: 'slats', label: 'Slats' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
  { id: 'dappled', label: 'Foliage' },
  { id: 'custom', label: 'Custom…' },
];

export function defaultGobo(): LightGobo {
  return { enabled: true, pattern: 'blinds', size: 1, rotation: 0, sharpness: 0.8, contrast: 1 };
}

const SIZE = 512;
const canvasCache = new Map<string, HTMLCanvasElement>();
const imgCache = new Map<string, THREE.Texture>();

function drawGobo(pattern: GoboPattern, sharpness: number, contrast: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const x = c.getContext('2d')!;
  const darkV = Math.round(255 * (1 - contrast));      // value of blocked areas (0 = full black)
  const dark = `rgb(${darkV},${darkV},${darkV})`;
  const blur = (1 - sharpness) * 14;                    // px feather on the mask edges
  const feather = () => { x.filter = blur ? `blur(${blur}px)` : 'none'; };

  const openBase = () => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, SIZE, SIZE); };  // light passes
  const blockBase = () => { x.fillStyle = dark; x.fillRect(0, 0, SIZE, SIZE); };      // blocked

  switch (pattern) {
    case 'blinds': case 'slats': {
      openBase(); feather(); x.fillStyle = dark;
      const n = 7, p = SIZE / n, bar = p * 0.52;
      for (let i = -1; i <= n; i++) {                    // ±1 so the blur wraps cleanly with RepeatWrapping
        if (pattern === 'blinds') x.fillRect(-blur, i * p, SIZE + blur * 2, bar);
        else x.fillRect(i * p, -blur, bar, SIZE + blur * 2);
      }
      break;
    }
    case 'grid': {
      openBase(); feather(); x.fillStyle = dark;
      const n = 6, p = SIZE / n, t = p * 0.28;
      for (let i = -1; i <= n; i++) { x.fillRect(-blur, i * p, SIZE + blur * 2, t); x.fillRect(i * p, -blur, t, SIZE + blur * 2); }
      break;
    }
    case 'window': {
      blockBase(); feather(); x.fillStyle = '#ffffff';   // dark frame, panes of light
      const m = SIZE * 0.10, cols = 2, rows = 3;
      const pw = (SIZE - m * (cols + 1)) / cols, ph = (SIZE - m * (rows + 1)) / rows;
      for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++)
        x.fillRect(m + cc * (pw + m), m + r * (ph + m), pw, ph);
      break;
    }
    case 'dots': {
      blockBase(); feather(); x.fillStyle = '#ffffff';   // pin-spots of light on a dark field
      const n = 5, p = SIZE / n, r = p * 0.28;
      for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) {
        x.beginPath(); x.arc(p * (i + 0.5), p * (j + 0.5), r, 0, Math.PI * 2); x.fill();
      }
      break;
    }
    case 'dappled': {
      openBase();                                         // organic leaf shadows: soft dark blobs
      x.filter = `blur(${6 + blur}px)`; x.fillStyle = dark;
      let s = 1337; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 64; i++) {
        const cx = rnd() * SIZE, cy = rnd() * SIZE, rr = SIZE * (0.035 + rnd() * 0.09);
        x.save(); x.translate(cx, cy); x.rotate(rnd() * Math.PI);
        x.beginPath(); x.ellipse(0, 0, rr, rr * (0.55 + rnd() * 0.8), 0, 0, Math.PI * 2); x.fill(); x.restore();
      }
      break;
    }
    default:
      openBase();
  }
  x.filter = 'none';
  return c;
}

// A cached CanvasTexture for a procedural gobo (keyed by the baked params). Caller applies size/rotation.
export function goboCanvasTexture(g: LightGobo): THREE.Texture {
  const key = `${g.pattern}|${g.sharpness}|${g.contrast}`;
  let canvas = canvasCache.get(key);
  if (!canvas) { canvas = drawGobo(g.pattern, g.sharpness, g.contrast); canvasCache.set(key, canvas); }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.center.set(0.5, 0.5);
  tex.anisotropy = 4;
  return tex;
}

// A small data-URL preview of a pattern for the gobo gallery (baked at default sharpness/contrast).
const thumbCache = new Map<GoboPattern, string>();
export function goboThumb(pattern: GoboPattern): string {
  if (pattern === 'custom') return '';
  let u = thumbCache.get(pattern);
  if (!u) {
    const src = drawGobo(pattern, 0.8, 1);
    const t = document.createElement('canvas'); t.width = t.height = 120;
    const x = t.getContext('2d')!; x.drawImage(src, 0, 0, 120, 120);
    u = t.toDataURL('image/png'); thumbCache.set(pattern, u);
  }
  return u;
}

// A cached image texture for a custom (uploaded) gobo. `onLoad` lets the caller trigger a re-render.
export function goboImageTexture(url: string, onLoad?: () => void): THREE.Texture {
  let tex = imgCache.get(url);
  if (!tex) {
    tex = new THREE.TextureLoader().load(url, () => onLoad?.());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.center.set(0.5, 0.5);
    tex.anisotropy = 4;
    imgCache.set(url, tex);
  }
  return tex;
}
