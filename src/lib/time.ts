// Timecode helpers (After Effects style H;MM;SS;FF) + frame snapping.
export function toTimecode(t: number, fps: number): string {
  const total = Math.max(0, Math.round(t * fps));
  const f = total % fps;
  const s = Math.floor(total / fps) % 60;
  const m = Math.floor(total / (fps * 60)) % 60;
  const h = Math.floor(total / (fps * 3600));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h};${p(m)};${p(s)};${p(f)}`;
}
// Parse a timecode back to seconds. Accepts "H;MM;SS;FF" (or : . / space separators) and shorter forms,
// read right-to-left as frames, seconds, minutes, hours. Returns null on garbage.
export function fromTimecode(str: string, fps: number): number | null {
  const parts = String(str).trim().split(/[;:.\s/]+/).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map(Number); if (nums.some(n => isNaN(n))) return null;
  const n = nums.length;
  const f = nums[n - 1] || 0;
  const s = n >= 2 ? nums[n - 2] || 0 : 0;
  const m = n >= 3 ? nums[n - 3] || 0 : 0;
  const h = n >= 4 ? nums[n - 4] || 0 : 0;
  return h * 3600 + m * 60 + s + f / (fps || 30);
}

export const snapToFrame = (t: number, fps: number) => Math.round(t * fps) / fps;
export const toFrames = (t: number, fps: number) => Math.round(t * fps);

// Pick a "nice" tick step (in frames) whose on-screen spacing is at least minPx.
export function niceFrameStep(pxPerFrame: number, fps: number, minPx: number): number {
  const secs = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1200];
  const cands = [1, 2, 5, 10, ...secs.map(s => s * fps)];
  for (const c of cands) if (c * pxPerFrame >= minPx) return c;
  return cands[cands.length - 1];
}
