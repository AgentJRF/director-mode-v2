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
  { id: 'foliage1', label: 'Foliage 1' },
  { id: 'foliage2', label: 'Foliage 2' },
  { id: 'caustics1', label: 'Caustics 1' },
  { id: 'caustics2', label: 'Caustics 2' },
  { id: 'custom', label: 'Custom…' },
];

// Image-backed gobos: grayscale masks shipped in public/gobos (white = light passes, dark = blocked).
// Resolved to a texture via goboImageTexture (same path as an uploaded custom gobo), not drawGobo.
const GOBO_IMAGE_URL: Partial<Record<GoboPattern, string>> = {
  foliage1: '/gobos/foliage-1.jpg',
  foliage2: '/gobos/foliage-2.jpg',
  caustics1: '/gobos/caustics-1.jpg',
  caustics2: '/gobos/caustics-2.jpg',
};
// The public URL for an image-backed gobo pattern (undefined for procedural patterns).
export const goboImageUrl = (pattern: GoboPattern): string | undefined => GOBO_IMAGE_URL[pattern];

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
    case 'blinds': {
      openBase(); feather(); x.fillStyle = dark;         // horizontal venetian bars
      const n = 7, p = SIZE / n, bar = p * 0.52;
      for (let i = -1; i <= n; i++) x.fillRect(-blur, i * p, SIZE + blur * 2, bar); // ±1 so blur wraps with RepeatWrapping
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
    default:                                              // image-backed patterns are handled elsewhere
      openBase();
  }
  x.filter = 'none';
  return c;
}

// Bake Scale (repeat) + Rotation into the mask. three.js does NOT apply a texture's matrix
// (repeat/rotation/offset) to a SpotLight.map, so these must be drawn in, not set on the texture.
// size > 1 zooms in (bigger pattern); size < 1 tiles denser. Rotation is in degrees, about the centre.
function applyGoboTransform(base: HTMLCanvasElement, size = 1, rotationDeg = 0): HTMLCanvasElement {
  const s = Math.max(0.1, size || 1);
  if (s === 1 && (!rotationDeg || rotationDeg % 360 === 0)) return base; // nothing to bake
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const x = c.getContext('2d')!;
  const pat = x.createPattern(base, 'repeat')!;
  const m = new DOMMatrix();
  m.translateSelf(SIZE / 2, SIZE / 2);
  m.rotateSelf(rotationDeg || 0);
  m.scaleSelf(s, s);
  m.translateSelf(-SIZE / 2, -SIZE / 2);
  pat.setTransform(m);
  x.fillStyle = pat;
  x.fillRect(0, 0, SIZE, SIZE);
  return c;
}

// A CanvasTexture for a procedural gobo, with Scale/Rotation baked in (see applyGoboTransform).
export function goboCanvasTexture(g: LightGobo): THREE.Texture {
  const key = `${g.pattern}|${g.sharpness}|${g.contrast}`;
  let canvas = canvasCache.get(key);
  if (!canvas) { canvas = drawGobo(g.pattern, g.sharpness, g.contrast); canvasCache.set(key, canvas); }
  const tex = new THREE.CanvasTexture(applyGoboTransform(canvas, g.size, g.rotation));
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

// A preview of the pattern PROJECTED ON A SPHERE (for the lighting-preset card): the flat mask is
// remapped through asin(x)/asin(y) so straight lines bow and compress toward the rim (curvature), and
// the pattern strength fades to neutral near the edge (light falls off at the limb). Grayscale + alpha,
// meant to be multiply-blended over the card's shaded gray sphere. Cached per pattern.
const sphereThumbCache = new Map<GoboPattern, string>();
export function goboSphereThumb(pattern: GoboPattern): string {
  if (pattern === 'custom') return '';
  const hit = sphereThumbCache.get(pattern);
  if (hit) return hit;
  const src = drawGobo(pattern, 0.8, 1);                 // flat mask (SIZE×SIZE)
  const sdata = src.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
  const N = 160, Rr = N / 2;
  const out = document.createElement('canvas'); out.width = out.height = N;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(N, N); const d = img.data;
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const nx = (px + 0.5 - Rr) / Rr, ny = (py + 0.5 - Rr) / Rr;
      const r2 = nx * nx + ny * ny; const idx = (py * N + px) * 4;
      if (r2 > 1) { d[idx + 3] = 0; continue; }
      // spherical remap: edges sample a wider range → the pattern compresses toward the rim
      const uu = 0.5 + Math.asin(Math.max(-1, Math.min(1, nx))) / Math.PI;
      const vv = 0.5 + Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
      const sx = Math.min(SIZE - 1, Math.max(0, (uu * SIZE) | 0));
      const sy = Math.min(SIZE - 1, Math.max(0, (vv * SIZE) | 0));
      const p = sdata[(sy * SIZE + sx) * 4];             // grayscale mask value
      const f = 1 - smooth(0.5, 1.0, Math.sqrt(r2));     // pattern strength → 0 at the limb
      const val = Math.round(255 * (1 - f) + p * f);     // neutral (255) at rim, pattern in the centre
      d[idx] = d[idx + 1] = d[idx + 2] = val; d[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const u = out.toDataURL('image/png'); sphereThumbCache.set(pattern, u);
  return u;
}

// Preloaded gobo source images (shared, keyed by URL). Returns the element once decoded, else null
// (kicks off the load and calls onReady when done so the caller can rebuild).
const goboImgCache = new Map<string, HTMLImageElement>();
const goboImgLoading = new Set<string>();
function loadGoboImage(url: string, onReady?: () => void): HTMLImageElement | null {
  const hit = goboImgCache.get(url);
  if (hit) return hit;
  if (!goboImgLoading.has(url)) {
    goboImgLoading.add(url);
    const img = new Image();
    img.onload = () => { goboImgCache.set(url, img); goboImgLoading.delete(url); onReady?.(); };
    img.onerror = () => { goboImgLoading.delete(url); };
    img.src = url;
  }
  return null;
}

// An image-backed gobo baked to a canvas so Softness (blur) and Contrast behave exactly like the
// procedural patterns. Rebuilt whenever pattern/sharpness/contrast change (SceneLights' memo deps).
// Returns null until the source image has loaded (then onReady triggers a rebuild).
export function goboImageCanvasTexture(g: LightGobo, url: string, onReady?: () => void): THREE.Texture | null {
  const img = loadGoboImage(url, onReady);
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, SIZE, SIZE);   // white base = light passes
  const blur = (1 - (g.sharpness ?? 0.85)) * 12;           // Softness → edge feather
  // Contrast is a real contrast() curve (not just a white wash): image gobos ship low-contrast, so the
  // default (1) already punches the pattern up so it reads; lower values flatten it toward mid-gray.
  const ctr = 0.6 + (g.contrast ?? 1) * 1.6;               // 0 → 0.6 (flat), 1 → 2.2 (punchy)
  x.filter = `${blur ? `blur(${blur}px) ` : ''}contrast(${ctr.toFixed(2)})`;
  x.drawImage(img, 0, 0, SIZE, SIZE);
  x.filter = 'none';
  const tex = new THREE.CanvasTexture(applyGoboTransform(c, g.size, g.rotation)); // bake Scale + Rotation
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.center.set(0.5, 0.5);
  tex.anisotropy = 4;
  return tex;
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
