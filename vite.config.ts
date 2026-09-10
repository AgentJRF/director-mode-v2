import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// ---- AI camera-match proxy (dev server) -----------------------------------
// POST /api/match-camera { imageBase64, mediaType, width, height }
//   → { azimuth_deg, elevation_deg, distance_factor, focal_mm, aperture_f, confidence, reasoning, mocked }
// If ANTHROPIC_API_KEY is set (.env), asks Claude vision to estimate the shot; otherwise returns a
// local heuristic (mocked:true) so the flow works end-to-end without a key.

interface Estimate {
  azimuth_deg: number; elevation_deg: number; distance_factor: number;
  focal_mm: number; aperture_f: number; confidence: number; reasoning: string; mocked?: boolean;
  // Optional EXACT pose (demo overrides): applied verbatim instead of the spherical azimuth/elevation.
  pose?: { position: [number, number, number]; rotation: [number, number, number]; focal: number; aperture: number; focusPoint: [number, number, number] | null };
}
const clampNum = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v)); return isNaN(n) ? dflt : Math.min(hi, Math.max(lo, n));
};
function clampEstimate(o: Record<string, unknown>): Estimate {
  return {
    azimuth_deg: clampNum(o.azimuth_deg, -180, 180, 30),
    elevation_deg: clampNum(o.elevation_deg, -25, 85, 12),
    distance_factor: clampNum(o.distance_factor, 1.2, 7, 2.6),
    focal_mm: clampNum(o.focal_mm, 14, 200, 50),
    aperture_f: clampNum(o.aperture_f, 1.4, 16, 2.8),
    confidence: clampNum(o.confidence, 0, 1, 0.5),
    reasoning: typeof o.reasoning === 'string' ? o.reasoning.slice(0, 200) : '',
  };
}

// --- Demo overrides (Wizard-of-Oz) ---------------------------------------
// Poses pre-analysed by hand for specific reference images, keyed by lowercased file name. Lets a demo
// show a convincing "AI match" with no API key / login: an upload whose name matches returns this pose
// (mocked:false, high confidence) instead of the heuristic. Fill entries as references are analysed.
const GILL_DUFFEL: Estimate = {
  azimuth_deg: -62, elevation_deg: 10, distance_factor: 3.37, focal_mm: 40, aperture_f: 8, confidence: 0.9,
  reasoning: 'Cylindrical holdall in 3/4 from a near eye-level angle: circular end large to camera-left, body receding right. Wide ~40mm framing, deep focus (even product lighting, minimal bokeh).',
  mocked: false,
};
// Macro detail shot (orange zip reference) — high, close top-down on the zip line, exact composed pose.
const ORANGE_DETAIL: Estimate = {
  azimuth_deg: -7, elevation_deg: 64, distance_factor: 1.1, focal_mm: 37, aperture_f: 1.4, confidence: 0.85,
  reasoning: 'Macro detail: high, close top-down on the zip line; shallow depth (f/1.4) → strong bokeh, ~37mm.',
  mocked: false,
  pose: { position: [-0.11, 3.27, 0.94], rotation: [-50.45, -8.45, 6.34], focal: 37, aperture: 1.4, focusPoint: [0.12, 1.3, -0.67] },
};
// Frontal macro detail (orange zip "lining" reference) — close, slightly high on the zip line, f/1.4.
const ORANGE_ZIP_FRONT: Estimate = {
  azimuth_deg: 7, elevation_deg: 59, distance_factor: 1.3, focal_mm: 50, aperture_f: 1.4, confidence: 0.88,
  reasoning: 'Frontal macro on the zip line: close and slightly high, shallow depth (f/1.4) → strong bokeh on the handles/background, ~50mm.',
  mocked: false,
  pose: { position: [0.15, 3.06, 1.29], rotation: [-36.52, 7.6, -4.46], focal: 50, aperture: 1.4, focusPoint: [0.01, 2.032, -0.02] },
};
// Matched by SUBSTRING of the uploaded file name (lowercased): e.g. "Gill-60L-duffel.jpg" → GILL_DUFFEL.
// NB: order matters — `find` returns the FIRST matching key, so put specific keys before generic ones
// ("orange-zip-lining" must hit `lining` → ORANGE_ZIP_FRONT, not the generic `orange`/`zip` top-down).
const DEMO: Record<string, Estimate> = {
  lining: ORANGE_ZIP_FRONT,
  gill: GILL_DUFFEL, duffel: GILL_DUFFEL, holdall: GILL_DUFFEL,
  orange: ORANGE_DETAIL, zip: ORANGE_DETAIL, detail: ORANGE_DETAIL, macro: ORANGE_DETAIL,
};

const PROMPT = `You are estimating the CAMERA used to shoot a product photograph, in order to recreate the framing in a 3D studio where a single product sits centered on a turntable.
Analyze the reference image and estimate the camera pose RELATIVE TO THE PRODUCT. Return ONLY a compact JSON object (no prose, no markdown fences) with keys:
- azimuth_deg: horizontal angle around the product. 0 = straight front, positive = camera to the product's right, negative = left. Range -180..180.
- elevation_deg: vertical angle. 0 = eye level, positive = high angle looking down, negative = low angle. Range -25..85.
- distance_factor: camera distance as a multiple of the product height (tight framing ~1.5, wide ~6).
- focal_mm: estimated 35mm-equivalent focal length (14..200).
- aperture_f: estimated aperture — MATCH the amount of background blur (bokeh) visible in the reference (1.4 = very shallow depth / strong bokeh, 16 = deep focus / everything sharp).
- confidence: number 0..1, your confidence in the estimate.
- reasoning: one short sentence.`;

async function estimateWithClaude(key: string, model: string, body: Record<string, unknown>): Promise<Estimate> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 500,
      messages: [{
        role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: body.mediaType || 'image/jpeg', data: body.imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });
  if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const data = await r.json() as { content?: { text?: string }[] };
  const text = (data.content || []).map(b => b.text || '').join('');
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
  return { ...clampEstimate(parsed), mocked: false };
}

// Local, key-free path: drive the already-authenticated Claude Code CLI in headless mode. Writes the
// image to a temp file inside the project, asks `claude -p` to Read + analyse it, parses the JSON.
// Returns null on any failure so the caller falls back to the heuristic.
async function estimateWithCli(body: Record<string, unknown>): Promise<Estimate | null> {
  const b64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  if (!b64) return null;
  const dir = join(process.cwd(), '.ai-tmp');
  const ext = String(body.mediaType || 'image/png').split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const file = join(dir, `ref-${Date.now()}.${ext}`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from(b64, 'base64'));
    const bin = process.env.CLAUDE_BIN || 'claude';
    const prompt = `Read the image file at this absolute path: ${file}\n\n${PROMPT}`;
    const out = await new Promise<string>((resolve, reject) => {
      const child = spawn(bin, ['-p', '--output-format', 'text', '--allowedTools', 'Read'], { shell: process.platform === 'win32' });
      let so = '', se = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('claude CLI timeout')); }, 90_000);
      child.stdout.on('data', d => (so += d));
      child.stderr.on('data', d => (se += d));
      child.on('error', reject);
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(so) : reject(new Error('claude CLI exit ' + code + ' ' + se.slice(0, 200))); });
      child.stdin.write(prompt); child.stdin.end();
    });
    const parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as Record<string, unknown>;
    return { ...clampEstimate(parsed), mocked: false };
  } catch (e) {
    console.warn('[ai-match] local Claude CLI unavailable:', (e as Error)?.message);
    return null;
  } finally {
    try { rmSync(file, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

function heuristic(body: Record<string, unknown>): Estimate {
  const w = Number(body.width) || 1, h = Number(body.height) || 1; const ar = w / h;
  const focal = ar < 0.85 ? 85 : ar > 1.5 ? 28 : 50; // portrait → longer lens, wide → shorter
  return {
    ...clampEstimate({ azimuth_deg: 32, elevation_deg: 12, distance_factor: 2.6, focal_mm: focal, aperture_f: 2.8, confidence: 0.4 }),
    reasoning: 'Heuristic estimate — log in to the local Claude CLI (`claude` → /login), or set ANTHROPIC_API_KEY, for a real analysis.', mocked: true,
  };
}

// ---- AI motion-match (video) — Wizard-of-Oz baked camera MOVES -------------
// POST /api/match-motion { name } → a MotionEstimate: a global camera gesture expressed as a
// start→end framing (spherical az/el/dist + focal/aperture) the client turns into a few editable
// carrier keyframes. Baked per reference clip by file-name substring (no real video analysis / key
// needed) — the video counterpart of the image /api/match-camera demo overrides.
interface MotionStep { az: number; el: number; dist: number; focal: number; aperture: number }
type EaseName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInOutStrong';
// Exact baked animation (verbatim keyframes) — overrides the spherical start/end arc when present.
interface MotionKey { t: number; pos: [number, number, number]; ease: EaseName; tOut?: [number, number, number]; tIn?: [number, number, number] }
interface MotionExact { target: [number, number, number] | null; focal: number; aperture: number; duration: number; keys: MotionKey[] }
interface MotionEstimate {
  gesture: string; duration: number; ease: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  start: MotionStep; end: MotionStep; confidence: number; reasoning: string; mocked?: boolean; exact?: MotionExact;
}
// Coffee-machine reference (Coffee_Machine_Video.mp4): a FACE-ON reveal that opens up (tight → wide) —
// starts close at a near eye-level hero framing, then cranes up and pulls back to a wider high-angle
// view; camera stays straight-front (azimuth 0, no orbit).
const COFFEE_REVEAL: MotionEstimate = {
  gesture: 'push-out + crane-up (tight → wide)', duration: 1.73, ease: 'easeInOut',
  start: { az: 0, el: 6, dist: 2.1, focal: 50, aperture: 4 },
  end: { az: 0, el: 20, dist: 3.6, focal: 50, aperture: 4 },
  confidence: 0.83,
  reasoning: 'Face-on reveal that opens up: starts tight at a near eye-level hero framing, then cranes up and pulls back to a wider view at a gentle high angle; the product stays centered and straight-front (no orbit). ~1.7s.',
  mocked: false,
  // Hand-authored move (captured from the app): the exact spline is applied verbatim.
  exact: {
    target: [0, 1.5, 0], focal: 50, aperture: 4, duration: 1.73,
    keys: [
      { t: 0, pos: [0, 1.704, 5.418], ease: 'linear', tOut: [0.012, -0.052, 1.064] },
      { t: 1.73, pos: [0, 3.777, 7.71], ease: 'easeInOut', tIn: [0.002, -1.125, -0.042] },
    ],
  },
};
// Matched by SUBSTRING of the uploaded file name (lowercased), same as the image demo overrides.
const MOTION_DEMO: Record<string, MotionEstimate> = {
  coffee: COFFEE_REVEAL, machine: COFFEE_REVEAL, packshot: COFFEE_REVEAL,
};
function motionHeuristic(): MotionEstimate {
  return {
    gesture: 'orbital reveal', duration: 3, ease: 'easeInOut',
    start: { az: -35, el: 18, dist: 3.0, focal: 50, aperture: 4 },
    end: { az: 35, el: 12, dist: 2.6, focal: 50, aperture: 4 },
    confidence: 0.4,
    reasoning: 'Heuristic motion — no baked match for this clip. Defaulting to a gentle orbital reveal (Wizard-of-Oz: baked camera moves are keyed by file name).',
    mocked: true,
  };
}

function aiPlugin(env: Record<string, string>): Plugin {
  const KEY = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  const MODEL = env.AI_MODEL || 'claude-sonnet-5';
  return {
    name: 'ai-match-camera',
    configureServer(server) {
      server.middlewares.use('/api/match-camera', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const send = (code: number, obj: unknown) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
          // Priority: demo override (baked pose for a known reference, matched by filename substring)
          //           → API key → local CLI → heuristic.
          const name = String(body.name || '').toLowerCase();
          const demoKey = Object.keys(DEMO).find(k => name.includes(k));
          const est = (demoKey && DEMO[demoKey]) ?? (KEY ? await estimateWithClaude(KEY, MODEL, body) : (await estimateWithCli(body)) ?? heuristic(body));
          send(200, est);
        } catch (e) {
          // Never hard-fail the UI: fall back to a heuristic and report the error alongside it.
          send(200, { ...heuristic({}), reasoning: 'AI error — heuristic fallback: ' + String((e as Error)?.message || e).slice(0, 160), mocked: true });
        }
      });
      // Video → camera MOVE (Wizard-of-Oz baked, keyed by file name).
      server.middlewares.use('/api/match-motion', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const send = (code: number, obj: unknown) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
          const name = String(body.name || '').toLowerCase();
          const key = Object.keys(MOTION_DEMO).find(k => name.includes(k));
          send(200, (key && MOTION_DEMO[key]) ?? motionHeuristic());
        } catch (e) {
          send(200, { ...motionHeuristic(), reasoning: 'Motion match error — heuristic fallback: ' + String((e as Error)?.message || e).slice(0, 160) });
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), aiPlugin(env)],
    // allowedHosts lets the GitHub Codespaces proxy (*.app.github.dev) reach the dev server; harmless
    // locally (localhost is always allowed).
    server: { port: 5173, strictPort: true, host: '127.0.0.1', allowedHosts: ['.app.github.dev'] },
  };
})
