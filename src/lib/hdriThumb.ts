import * as THREE from 'three';

// data-URL thumbnails of loaded HDRIs, keyed by the equirect URL. Filled by SceneLights' EnvNode after
// it loads a texture; read by the LightInspector to preview the environment like Substance Stager.
export const hdriThumbs = new Map<string, string>();

// Render an equirect texture FLAT into a tiny sRGB render target (tone-mapped to LDR), read the pixels
// back and encode a JPEG data URL. GPU sampling makes this work for any texture type — half-float EXR,
// RGBE .hdr, byte, etc. — without decoding the HDR data on the CPU.
export function makeHdriThumb(gl: THREE.WebGLRenderer, tex: THREE.Texture, url: string): string {
  const W = 200, H = 100;
  const rt = new THREE.WebGLRenderTarget(W, H);
  rt.texture.colorSpace = THREE.SRGBColorSpace; // so the read-back bytes are display-ready (not linear)
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0, 1); // frames a 2×1 plane exactly
  const prevMapping = tex.mapping; tex.mapping = THREE.UVMapping; tex.needsUpdate = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ map: tex }));
  scene.add(mesh);

  const prevRT = gl.getRenderTarget();
  const prevTone = gl.toneMapping, prevExp = gl.toneMappingExposure;
  gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1;
  gl.setRenderTarget(rt); gl.clear(); gl.render(scene, cam);
  const buf = new Uint8Array(W * H * 4); gl.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  gl.setRenderTarget(prevRT); gl.toneMapping = prevTone; gl.toneMappingExposure = prevExp;
  tex.mapping = prevMapping; tex.needsUpdate = true;

  // readRenderTargetPixels is bottom-up → flip rows into a canvas.
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d')!; const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) { const s = (H - 1 - y) * W * 4; img.data.set(buf.subarray(s, s + W * 4), y * W * 4); }
  ctx.putImageData(img, 0, 0);
  const dataUrl = cvs.toDataURL('image/jpeg', 0.82);

  (mesh.material as THREE.Material).dispose(); mesh.geometry.dispose(); rt.dispose();
  hdriThumbs.set(url, dataUrl);
  return dataUrl;
}
