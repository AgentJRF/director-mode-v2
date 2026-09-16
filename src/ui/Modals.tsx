import { useState } from 'react';
import { S, PIVOT } from '../store';
import MatchPreview, { MotionPreview } from '../three/MatchPreview';
import { useRev } from './bits';
import { evaluate, eulerFromLookAt, sphericalToPose, clamp } from '../lib/eval';
import { matchCamera, matchMotion, matchLighting, type LightingMetrics, type LightingEstimate } from '../lib/aiMatch';
import { fuseAB, applyMotionSpec, stepToPose, arcControls, type MotionSpec, type MotionStep } from '../lib/presets';
import { applyLightPreset } from '../lib/lightPresets';
import { setEnvHdriFromImage } from '../lib/lights';
import type { Ease, Vec3 } from '../types';

function Shell({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) S().setModal(null); }}>
      <div className="modal">
        <div className="modal-h">{title}</div>
        <div className="modal-b">{children}</div>
        <div className="modal-f">{footer}</div>
      </div>
    </div>
  );
}

// Camera estimate returned by /api/match-camera (Claude vision or heuristic fallback).
type ExactPose = { position: Vec3; rotation: Vec3; focal: number; aperture: number; focusPoint: Vec3 | null };
type Estimate = { azimuth_deg: number; elevation_deg: number; distance_factor: number; focal_mm: number; aperture_f: number; confidence: number; reasoning: string; mocked?: boolean; pose?: ExactPose };
type MatchForm = { azimuth: number; elevation: number; distance: number; focal: number; aperture: number };

const ConfBar = ({ c }: { c: number }) => (
  <span className="conf" style={{ flex: 1 }}>
    <span className="conf-bar"><i style={{ width: Math.round(c * 100) + '%', background: c > 0.8 ? '#4fb477' : c > 0.7 ? '#e0a34a' : '#d9614e' }} /></span>
    <span className="val">{Math.round(c * 100)}%</span>
  </span>
);

function InterpModal() {
  useRev(); const st = S(); const cam = st.active();
  const capture = (which: 'A' | 'B') => { const p = evaluate(cam, st.project.timeline.playhead); st.setPoseAB(which, { position: p.position, rotation: p.rotation, focal: cam.optics.focalLength }); };
  const Card = ({ which }: { which: 'A' | 'B' }) => {
    const pose = which === 'A' ? st.ui.poseA : st.ui.poseB;
    return (
      <div className="ref" style={{ padding: 12, cursor: 'default' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Pose {which}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {pose ? `pos ${pose.position.map(v => v.toFixed(1)).join(', ')}\nfocal ${Math.round(pose.focal)}mm` : '— not captured —'}
        </div>
        <button className="btn-sm btn-full" style={{ marginTop: 8 }} onClick={() => capture(which)}>Capture current view</button>
      </div>
    );
  };
  return (
    <Shell title="Interpolation A → B"
      footer={<><button className="tbtn" onClick={() => S().setModal(null)}>Cancel</button><button className="tbtn primary" onClick={fuseAB}>Merge into 1 camera</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Compose a view and capture A, compose another and capture B. Merging creates ONE 2-key camera (A and B don't remain as ghost cameras).</p>
      <div className="ref-grid" style={{ gridTemplateColumns: '1fr 1fr' }}><Card which="A" /><Card which="B" /></div>
    </Shell>
  );
}

function AIImageModal() {
  const [img, setImg] = useState<{ data: string; media: string; url: string; w: number; h: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [form, setForm] = useState<MatchForm | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const url = rd.result as string;
      const data = url.slice(url.indexOf(',') + 1);
      const media = url.slice(5, url.indexOf(';'));
      const im = new Image();
      im.onload = () => setImg({ data, media, url, w: im.naturalWidth, h: im.naturalHeight, name: f.name });
      im.src = url;
    };
    rd.readAsDataURL(f);
  };

  const analyze = async () => {
    if (!img) { S().toast('Upload an image first'); return; }
    setBusy(true);
    try {
      const e = await matchCamera({ name: img.name, width: img.w, height: img.h, imageBase64: img.data, mediaType: img.media }) as Estimate;
      setEst(e);
      setForm({ azimuth: e.azimuth_deg, elevation: e.elevation_deg, distance: e.distance_factor, focal: e.focal_mm, aperture: e.aperture_f });
    } catch { S().toast('AI request failed'); }
    setBusy(false);
  };

  // Apply a framing to the ACTIVE camera (no keys) — used both for the live preview and the final apply.
  const applyForm = (f: MatchForm) => {
    const r = clamp(f.distance * 2, 1.6, 14); // product is ~2 units tall (Product.tsx normalises height→2)
    const theta = f.azimuth * Math.PI / 180;
    const phi = clamp((90 - f.elevation) * Math.PI / 180, 0.12, Math.PI - 0.12);
    const pos = sphericalToPose({ r, theta, phi }, PIVOT);
    const st = S(); const cam = st.active();
    cam.transform.position = pos;
    cam.transform.rotation = eulerFromLookAt(pos, PIVOT.toArray() as Vec3);
    cam.optics.focalLength = clamp(f.focal, 14, 200);
    cam.optics.aperture = clamp(f.aperture, 1.4, 16); // aperture drives the bokeh strength (DoF)
    cam.optics.focusPoint = null; // anchor focus on the product (General) — clears any stale picked point
    st.bump();
  };

  // Apply an EXACT baked pose (demo overrides) verbatim to the active camera — no keys.
  const applyExact = (p: ExactPose) => {
    const st = S(); const cam = st.active();
    cam.transform.position = [...p.position] as Vec3;
    cam.transform.rotation = [...p.rotation] as Vec3;
    cam.optics.focalLength = p.focal; cam.optics.aperture = p.aperture; cam.optics.focusPoint = p.focusPoint;
    st.bump();
  };

  const back = () => { setEst(null); setForm(null); };          // return to upload (real camera untouched)
  const cancel = () => S().setModal(null);
  const apply = () => {                                          // commit the framing to the active camera
    if (est?.pose) applyExact(est.pose);                        // exact composed pose (demo) wins
    else if (form) applyForm(form);
    S().setViewMode('camera'); S().setModal(null); S().toast('Pose composed from image (no keys)');
  };

  if (est && form) {
    const aspect = S().project.canvas.width / S().project.canvas.height;
    // Editing any field switches to manual (spherical) mode → drop the exact baked pose.
    const num = (label: string, key: keyof MatchForm, step: number, min: number, max: number) => (
      <div className="row"><label>{label}</label>
        <input type="number" step={step} value={form[key]} style={{ width: 80 }}
          onChange={e => { setForm({ ...form, [key]: clamp(parseFloat(e.target.value) || 0, min, max) }); setEst(p => p ? { ...p, pose: undefined } : p); }} /></div>
    );
    // Floating window with a windowed render preview next to the reference — nothing is applied to the
    // real camera until "Apply pose".
    return (
      <Shell title="AI review · Match camera from image"
        footer={<><button className="tbtn" onClick={back}>← Back</button>
          <button className="tbtn primary" onClick={apply}>Apply pose</button></>}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Reference</div>
            {img && <img src={img.url} alt="reference" style={{ width: '100%', aspectRatio: String(aspect), objectFit: 'contain', borderRadius: 6, border: '1px solid var(--line-2)', background: '#000' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Preview render</div>
            <div style={{ width: '100%', aspectRatio: String(aspect), borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line-2)' }}>
              <MatchPreview azimuth={form.azimuth} elevation={form.elevation} distance={form.distance} focal={form.focal} aperture={form.aperture} aspect={aspect} pose={est.pose} />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}><label>Confidence</label><ConfBar c={est.confidence} /></div>
        {est.mocked && <span className="badge proto">estimated (heuristic)</span>}
        <p className="hint" style={{ marginTop: 6 }}>{est.reasoning}</p>
        <div className="sect-t" style={{ padding: 0, margin: '12px 0 2px' }}>Estimated framing — adjustable</div>
        {num('Azimuth °', 'azimuth', 1, -180, 180)}
        {num('Elevation °', 'elevation', 1, -25, 85)}
        {num('Distance ×', 'distance', 0.1, 1.2, 7)}
        {num('Focal mm', 'focal', 1, 14, 200)}
        {num('Aperture f/', 'aperture', 0.1, 1.4, 16)}
        <p className="hint">Composes a shot — writes no keyframes. The timeline is unchanged.</p>
      </Shell>
    );
  }

  return (
    <Shell title="AI · Match camera from image"
      footer={<><button className="tbtn" onClick={cancel}>Cancel</button>
        <button className="tbtn primary" onClick={analyze}>{busy ? 'Analyzing…' : 'Analyze'}</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Upload a reference photo — the AI estimates the camera angle, focal length and aperture, then composes the shot (writes NO keys).</p>
      <label className="ai-drop">
        {img ? <img src={img.url} alt="reference" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
          : <span style={{ color: 'var(--ink-2)' }}>⬆ Click to upload an image (JPG / PNG)</span>}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
      </label>
    </Shell>
  );
}

// Motion estimate returned by /api/match-motion (baked Wizard-of-Oz move, or heuristic fallback).
type MotionEstimate = { gesture: string; duration: number; ease: Ease; start: MotionStep; end: MotionStep; confidence: number; reasoning: string; mocked?: boolean; exact?: { target: Vec3 | null; focal: number; aperture: number; duration: number; keys: { t: number; pos: Vec3; ease: Ease; tOut?: Vec3; tIn?: Vec3 }[] } };

function AIVideoModal() {
  const [vid, setVid] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<MotionEstimate | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setVid({ url: URL.createObjectURL(f), name: f.name });
    setEst(null);
  };

  const analyze = async () => {
    if (!vid) { S().toast('Upload a video first'); return; }
    setBusy(true);
    try {
      setEst(await matchMotion(vid.name) as MotionEstimate);
    } catch { S().toast('AI request failed'); }
    setBusy(false);
  };

  const back = () => setEst(null);
  const apply = () => {
    if (!est) return;
    applyMotionSpec(est as MotionSpec);
    S().setViewMode('camera'); S().setModal(null);
  };

  if (est && vid) {
    const aspect = S().project.canvas.width / S().project.canvas.height;
    const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
    // Exact hand-authored move: preview its own spline (first→last key, tangents, target). Else the
    // computed spherical arc from start→end.
    const ex = est.exact;
    const ks = ex?.keys;
    const from = ks ? ks[0].pos : stepToPose(est.start);
    const to = ks ? ks[ks.length - 1].pos : stepToPose(est.end);
    const arc = ks ? null : arcControls(from, to);
    const c1 = ks ? (ks[0].tOut ? add(ks[0].pos, ks[0].tOut) : ks[0].pos) : arc!.c1;
    const c2 = ks ? (ks[ks.length - 1].tIn ? add(ks[ks.length - 1].pos, ks[ks.length - 1].tIn!) : ks[ks.length - 1].pos) : arc!.c2;
    const aim: Vec3 = ex?.target ?? (PIVOT.toArray() as Vec3);
    const previewFocal = ex ? ex.focal : est.start.focal;
    const previewDur = ex ? ex.duration : est.duration;
    return (
      <Shell title="AI review · Motion from video"
        footer={<><button className="tbtn" onClick={back}>← Back</button>
          <button className="tbtn primary" onClick={apply}>Apply animation</button></>}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Reference clip</div>
            <video src={vid.url} autoPlay muted loop playsInline style={{ width: '100%', aspectRatio: String(aspect), objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line-2)', background: '#000' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Matched move (preview)</div>
            <div style={{ width: '100%', aspectRatio: String(aspect), borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line-2)' }}>
              <MotionPreview from={from} to={to} c1={c1} c2={c2} aim={aim} focal={previewFocal} aspect={aspect} duration={previewDur} />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}><label>Detected gesture</label><span className="val">{est.gesture}</span></div>
        <div className="row"><label>Confidence</label><ConfBar c={est.confidence} /></div>
        {est.mocked && <span className="badge proto">estimated (heuristic)</span>}
        <p className="hint" style={{ marginTop: 6 }}>{est.reasoning}</p>
        <p className="hint">Baked as editable Bézier keyframes on the active camera, keeping the product framed — natural crane feel, not a straight line.</p>
      </Shell>
    );
  }

  return (
    <Shell title="AI · Animation from video"
      footer={<><button className="tbtn" onClick={() => S().setModal(null)}>Cancel</button>
        <button className="tbtn primary" onClick={analyze}>{busy ? 'Analyzing…' : 'Analyze'}</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Upload a reference clip — the AI infers the global camera gesture and recreates it as a few editable keyframes on the active camera (product-agnostic: the move is retargeted onto your scene).</p>
      <label className="ai-drop">
        {vid ? <video src={vid.url} autoPlay muted loop playsInline style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
          : <span style={{ color: 'var(--ink-2)' }}>⬆ Click to upload a video (MP4 / WebM / MOV)</span>}
        <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
      </label>
    </Shell>
  );
}

const AI_ICON = {
  camera: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></svg>,
  film: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4" /></svg>,
  rays: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.4" /><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9" /></svg>,
  globe: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><ellipse cx="12" cy="12" rx="3.6" ry="8.5" /><path d="M3.5 12h17" /></svg>,
};

// ✦ AI hub — one entry that groups the camera + lighting AI flows (tabbed). Each option opens its
// dedicated modal so the existing flows are reused unchanged.
function AIHubModal() {
  const [tab, setTab] = useState<'camera' | 'lighting'>('camera');
  const Card = ({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) => (
    <button onClick={onClick}
      style={{ display: 'flex', gap: 11, alignItems: 'flex-start', textAlign: 'left', width: '100%', padding: 13, background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 11, cursor: 'pointer', transition: 'border-color .12s, transform .1s, box-shadow .12s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cff'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(120,90,255,.18)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <span style={{ flex: '0 0 auto', width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(139,92,255,.28),rgba(63,138,224,.28))', color: '#c9b6ff' }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{title}</div>
        <div className="hint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>{desc}</div>
      </span>
    </button>
  );
  return (
    <Shell title="✦ AI" footer={<button className="tbtn" onClick={() => S().setModal(null)}>Close</button>}>
      <p className="hint" style={{ marginTop: 0 }}>Compose from a reference — for the camera, or the lighting.</p>
      <div className="seg" style={{ marginBottom: 14, display: 'flex' }}>
        <button className={tab === 'camera' ? 'sel' : ''} onClick={() => setTab('camera')} style={{ flex: 1 }}>Camera</button>
        <button className={tab === 'lighting' ? 'sel' : ''} onClick={() => setTab('lighting')} style={{ flex: 1 }}>Lighting</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tab === 'camera' ? (<>
          <Card icon={AI_ICON.camera} title="From image" desc="Compose a shot from a reference photo — angle, focal, aperture." onClick={() => S().setModal('ai-image')} />
          <Card icon={AI_ICON.film} title="From video" desc="Recreate a camera move from a clip as editable keyframes." onClick={() => S().setModal('ai-video')} />
        </>) : (<>
          <Card icon={AI_ICON.rays} title="Match reference" desc="Set up a matching light rig from a reference image." onClick={() => S().setModal('ai-light-match')} />
          <Card icon={AI_ICON.globe} title="Env light from image" desc="Build an environment (IBL) so reflections match the asset." onClick={() => S().setModal('ai-light-env')} />
        </>)}
      </div>
    </Shell>
  );
}

// ✦ AI · Lighting from a reference image → a matching preset (editable rig). Reads the image's overall
// tone (luminance / warmth / saturation) client-side and maps it to a lighting preset (Wizard-of-Oz).
function AILightMatchModal() {
  const [img, setImg] = useState<{ url: string; data: string; media: string; name: string; metrics: LightingMetrics } | null>(null);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<LightingEstimate | null>(null);

  const onFile = (f?: File) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const url = rd.result as string;
      const data = url.slice(url.indexOf(',') + 1), media = url.slice(5, url.indexOf(';'));
      const im = new Image();
      im.onload = () => {
        const N = 32, c = document.createElement('canvas'); c.width = c.height = N;
        const x = c.getContext('2d')!; x.drawImage(im, 0, 0, N, N); const d = x.getImageData(0, 0, N, N).data;
        let rs = 0, bs = 0, lum = 0, sat = 0; const n = N * N;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          rs += r; bs += b; lum += 0.299 * r + 0.587 * g + 0.114 * b;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx > 0 ? (mx - mn) / mx : 0;
        }
        setImg({ url, data, media, name: f.name, metrics: { lum: lum / n, warmth: (rs - bs) / n, sat: sat / n } });
      };
      im.src = url;
    };
    rd.readAsDataURL(f);
  };
  const analyze = async () => {
    if (!img) { S().toast('Upload an image first'); return; }
    setBusy(true);
    try { setEst(await matchLighting({ name: img.name, metrics: img.metrics, imageBase64: img.data, mediaType: img.media })); }
    catch { S().toast('AI request failed'); }
    setBusy(false);
  };
  const apply = () => { if (!est) return; applyLightPreset(est.preset); S().setModal(null); S().toast(`${est.label} lighting applied`); };

  if (est && img) {
    return (
      <Shell title="AI review · Lighting from image"
        footer={<><button className="tbtn" onClick={() => setEst(null)}>← Back</button><button className="tbtn primary" onClick={apply}>Apply lighting</button></>}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Reference</div>
            <img src={img.url} alt="reference" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--line-2)', background: '#000' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sect-t" style={{ padding: 0, margin: '0 0 4px' }}>Matched lighting</div>
            <div style={{ padding: 12, border: '1px solid var(--line-2)', borderRadius: 6, background: 'var(--panel-2)' }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{est.label}</div>
              <div className="row" style={{ marginTop: 8 }}><label>Confidence</label><ConfBar c={est.confidence} /></div>
              {est.mocked && <span className="badge proto">estimated (heuristic)</span>}
            </div>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{est.reasoning}</p>
        <p className="hint">Applies the matched preset as editable lights — replaces the working lights, keeps the cameras + environment.</p>
      </Shell>
    );
  }
  return (
    <Shell title="AI · Lighting from image"
      footer={<><button className="tbtn" onClick={() => S().setModal('ai')}>← Back</button><button className="tbtn primary" onClick={analyze}>{busy ? 'Analyzing…' : 'Analyze'}</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Upload a reference photo — the AI reads its overall lighting (tone, warmth, contrast) and sets up a matching light rig you can tweak.</p>
      <label className="ai-drop">
        {img ? <img src={img.url} alt="reference" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
          : <span style={{ color: 'var(--ink-2)' }}>⬆ Click to upload an image (JPG / PNG)</span>}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
      </label>
    </Shell>
  );
}

// ✦ AI · Env light from a reference image → sets the scene's environment (IBL) to that image so the
// asset's reflections + ambient pick up its tones. (Wizard-of-Oz: the image is used directly as the env.)
function AILightEnvModal() {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const onFile = (f?: File) => { if (!f) return; setFile({ url: URL.createObjectURL(f), name: f.name }); };
  const apply = () => {
    if (!file) { S().toast('Upload an image first'); return; }
    setEnvHdriFromImage(file.url, file.name); S().setModal(null); S().toast('Environment built from image');
  };
  return (
    <Shell title="AI · Env light from image"
      footer={<><button className="tbtn" onClick={() => S().setModal('ai')}>← Back</button><button className="tbtn primary" onClick={apply}>Build environment</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Upload a reference image — it becomes the scene's environment (IBL) so the asset's reflections and ambient pick up its tones. Tune Intensity / Rotation afterwards on the Environment light. Equirectangular (360°) images map best.</p>
      <label className="ai-drop">
        {file ? <img src={file.url} alt="reference" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
          : <span style={{ color: 'var(--ink-2)' }}>⬆ Click to upload an image (JPG / PNG)</span>}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
      </label>
    </Shell>
  );
}

const RATIOS: [string, number, number][] = [['16:9', 1920, 1080], ['9:16', 1080, 1920], ['1:1', 1080, 1080], ['2.39:1', 2048, 858], ['4:5', 1080, 1350]];

function ExportModal() {
  useRev(); const st = S(); const canvas = st.project.canvas;
  const [fps, setFps] = useState(30);
  const [prog, setProg] = useState(0);

  const canvasEl = () => document.querySelector('#canvas-wrap canvas') as HTMLCanvasElement | null;
  const exportStatic = () => { const c = canvasEl(); if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'director-shot.png'; a.click(); st.toast('Still shot exported (PNG)'); };
  const exportVideo = async () => {
    const c = canvasEl(); if (!c) return; const cam = st.active();
    if (cam.keyframes.length === 0) { st.toast('Static camera: animate first'); return; }
    let rec: MediaRecorder;
    const stream = c.captureStream(fps);
    try { rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' }); }
    catch { try { rec = new MediaRecorder(stream, { mimeType: 'video/webm' }); } catch { st.toast('MediaRecorder unavailable'); return; } }
    const chunks: Blob[] = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise<void>(res => { rec.onstop = () => res(); });
    st.setRecording(true); rec.start();
    const dur = st.project.timeline.duration; st.setPlaying(false); st.setPlayhead(0);
    const t0 = performance.now();
    await new Promise<void>(res => {
      const step = () => { const e = (performance.now() - t0) / 1000; st.setPlayhead(Math.min(e, dur)); setProg(Math.min(e / dur, 1) * 100); if (e < dur) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    });
    rec.stop(); await done; st.setRecording(false); setProg(0);
    const blob = new Blob(chunks, { type: 'video/webm' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'director-shot.webm'; a.click();
    st.toast('Video exported (WebM · ' + fps + 'fps)');
  };

  return (
    <Shell title="Output / export"
      footer={<>
        <button className="tbtn" onClick={exportStatic}>⬇ Still shot (PNG)</button>
        <button className="tbtn primary" onClick={exportVideo}>⬇ Export video</button>
        <button className="tbtn" onClick={() => S().setModal(null)}>Close</button></>}>
      <div className="sect-t" style={{ padding: 0, marginBottom: 6 }}>Canvas size (project setting)</div>
      <div className="seg">
        {RATIOS.map(([lbl, w, h]) => (
          <button key={lbl} className={w === canvas.width && h === canvas.height ? 'sel' : ''} onClick={() => st.setCanvas(w, h)}>{lbl}</button>
        ))}
      </div>
      <div className="sect-t" style={{ padding: 0, margin: '16px 0 6px' }}>Video export — active camera</div>
      <div className="row"><label>Frames / s</label>
        <div className="seg">{[24, 30, 60].map(f => <button key={f} className={f === fps ? 'sel' : ''} onClick={() => setFps(f)}>{f}</button>)}</div></div>
      <div className="row"><label>Format</label><span className="val">WebM (VP9)</span></div>
      <div className="hint">Open decision (not settled): active camera only vs cuts between cameras. Active camera first.</div>
      <div className="progress"><i style={{ width: prog + '%' }} /></div>
    </Shell>
  );
}

export default function Modals() {
  useRev();
  const m = S().ui.modal;
  if (m === 'interp') return <InterpModal />;
  if (m === 'ai') return <AIHubModal />;
  if (m === 'ai-image') return <AIImageModal />;
  if (m === 'ai-video') return <AIVideoModal />;
  if (m === 'ai-light-match') return <AILightMatchModal />;
  if (m === 'ai-light-env') return <AILightEnvModal />;
  if (m === 'export') return <ExportModal />;
  return null;
}
