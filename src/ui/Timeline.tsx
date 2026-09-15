import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { S, CAM_COLORS, clipRange } from '../store';
import { useRev } from './bits';
import { clamp, evaluate, keysOf, poiPoint } from '../lib/eval';
import { lightKeysOf, moveLightKeysTimes, removeLightKey, selectLight, deselectLight } from '../lib/lights';
import { toTimecode, fromTimecode, snapToFrame, niceFrameStep } from '../lib/time';
import type { Channel, Keyframe } from '../types';

const TRACK_H = 26, ROW_H = 18, GAP = 8, TOP_H = 22, LEFT = 8, RIGHT = 24;
const PLAYHEAD = '#29b6f6';

type RowDef = { label: string; ch: Channel; lock?: boolean };

export default function Timeline() {
  useRev();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [durUnit, setDurUnit] = useState<'s' | 'f' | 'tc'>('s');
  const [durText, setDurText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [colorMenu, setColorMenu] = useState<{ camId: string; x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ camId: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: 'scrub' | 'key' | 'marquee' | 'clip' | 'clip-move' | 'lkey'; keyId?: string; camId?: string; edge?: 'start' | 'end'; x0?: number; y0?: number; moved?: boolean; grabbedBase?: number; base?: { id: string; t: number }[]; baseStart?: number; grabT?: number; pointerId?: number } | null>(null);

  // End any in-progress drag on ANY pointerup/cancel or window blur — even if the SVG's own pointerup is
  // missed (released outside the element, over browser chrome, etc.). Also releases the pointer capture so
  // a stuck capture can never leave the whole UI unclickable.
  useEffect(() => {
    const end = () => {
      const d = drag.current; if (!d) return;
      if (svgRef.current && d.pointerId != null) { try { svgRef.current.releasePointerCapture(d.pointerId); } catch { /* noop */ } }
      if (d.mode === 'marquee' && !d.moved) S().selectKey(null); // click on empty area clears selection
      drag.current = null; setMarquee(null);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); window.removeEventListener('blur', end); };
  }, []);

  useEffect(() => {
    if (!colorMenu) return;
    const close = () => setColorMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setColorMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
  }, [colorMenu]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
  }, [ctxMenu]);

  useLayoutEffect(() => {
    const el = scrollRef.current!; const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el); setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const st = S(); const proj = st.project; const cams = proj.cameras.filter(c => !st.ui.hidden['cam:' + c.id]); const tl = proj.timeline; const fps = proj.fps;
  const dur = tl.duration;
  const fitPxPerSec = Math.max(4, (viewW - LEFT - RIGHT) / dur);
  const pxPerSec = fitPxPerSec * zoom;
  const contentW = Math.max(viewW, LEFT + dur * pxPerSec + RIGHT);
  const x = (t: number) => LEFT + t * pxPerSec;
  const timeFromX = (px: number) => clamp((px - LEFT) / pxPerSec, 0, dur);
  const snap = (t: number) => snapToFrame(t, fps);
  // Snap an edge to nearby cut points — 0, the timeline end, the playhead, and every OTHER clip's
  // start/end (butt-join cuts) — within ~8px; otherwise fall back to frame snapping.
  const snapTime = (t: number, excludeId: string) => {
    const pts = [0, dur, tl.playhead];
    proj.cameras.forEach(c => { if (c.id !== excludeId && !st.ui.hidden['cam:' + c.id]) { const [s, e] = clipRange(c, dur); pts.push(s, e); } });
    let best: number | null = null, bestD = 8 / pxPerSec;
    for (const p of pts) { const d = Math.abs(t - p); if (d < bestD) { best = p; bestD = d; } }
    return best !== null ? best : snap(t);
  };

  const rowsFor = (c: typeof cams[number]): RowDef[] => ([
    { label: 'Point of Interest', ch: 'poi', lock: c.target?.type === 'object' },
    { label: 'Position', ch: 'position' },
    { label: 'Orientation', ch: 'rotation', lock: !!c.target },
    // Focal & aperture are static per shot (not keyframable); motion blur is a global On/Off — none shown here.
  ]);

  let yCur = TOP_H + 8;
  const layout = cams.map(c => {
    const headerY = yCur; yCur += TRACK_H;
    const exp = !!expanded[c.id];
    const defs = exp ? rowsFor(c) : [];
    const rows = defs.map(def => { const ry = yCur; yCur += ROW_H; return { def, ry }; });
    yCur += GAP;
    return { c, headerY, exp, rows };
  });

  // Lights live in the timeline PERMANENTLY (like cameras / AE layers) — not only while selected.
  // Env has no animatable pose, so it's skipped. Each track is collapsed by default (▸/▾).
  const lightRowsFor = (l: typeof proj.lights[number]): RowDef[] => {
    const positional = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'point' || l.kind === 'area';
    const aims = l.kind === 'spot' || l.kind === 'directional' || l.kind === 'area';
    return [
      ...(positional ? [{ label: 'Position', ch: 'position' as Channel }] : []),
      ...(aims ? [{ label: 'Aim (POI)', ch: 'poi' as Channel, lock: l.target?.type === 'object' }] : []),
      { label: 'Intensity', ch: 'intensity' as Channel },
    ];
  };
  const lightLayout = proj.lights.filter(l => l.kind !== 'env').map(l => {
    const headerY = yCur; yCur += TRACK_H;
    const exp = !!expanded['light:' + l.id];
    const rows = (exp ? lightRowsFor(l) : []).map(def => { const ry = yCur; yCur += ROW_H; return { def, ry }; });
    yCur += GAP;
    return { l, headerY, exp, rows };
  });

  const H = yCur + 4;

  // screen positions of every visible (expanded) keyframe diamond — used for marquee hit-testing
  const keyPositions: { id: string; x: number; y: number }[] = [];
  layout.forEach(({ c, rows }) => rows.forEach(({ def, ry }) => keysOf(c, def.ch).forEach(k => keyPositions.push({ id: k.id, x: x(k.time), y: ry + ROW_H / 2 }))));

  const pxPerFrame = pxPerSec / fps;
  const minorStep = niceFrameStep(pxPerFrame, fps, 6);
  const labelStep = niceFrameStep(pxPerFrame, fps, 70);
  const durFrames = Math.round(dur * fps);
  const fFrom = Math.max(0, Math.floor((scrollLeft - LEFT - 40) / pxPerFrame));
  const fTo = Math.min(durFrames, Math.ceil((scrollLeft + viewW - LEFT + 40) / pxPerFrame));
  const ticks: { f: number; label: boolean }[] = [];
  for (let f = Math.floor(fFrom / minorStep) * minorStep; f <= fTo; f += minorStep) { if (f >= 0) ticks.push({ f, label: f % labelStep === 0 }); }

  const svgPt = (e: React.PointerEvent) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => {
    const el = e.target as SVGElement;
    const colorId = el.getAttribute('data-color');
    if (colorId) { setColorMenu({ camId: colorId, x: e.clientX, y: e.clientY }); return; }
    const toggle = el.getAttribute('data-toggle');
    if (toggle) { setExpanded(x0 => ({ ...x0, [toggle]: !x0[toggle] })); return; }
    const clipEdge = el.getAttribute('data-clip-start') || el.getAttribute('data-clip-end');
    if (clipEdge) {
      const edge = el.getAttribute('data-clip-start') ? 'start' as const : 'end' as const;
      if (clipEdge !== proj.activeCameraId) S().selectCamera(clipEdge);
      try { (e.currentTarget as SVGElement).setPointerCapture(e.pointerId); } catch { /* best-effort */ }
      drag.current = { mode: 'clip', camId: clipEdge, edge, pointerId: e.pointerId };
      return;
    }
    const lkey = el.getAttribute('data-lkey');
    if (lkey) {
      try { (e.currentTarget as SVGElement).setPointerCapture(e.pointerId); } catch { /* best-effort */ }
      // Select the light that owns this key (so moveLightKeysTimes/removeLightKey act on it), then drag.
      const owner = proj.lights.find(l => l.keyframes.some(k => k.id === lkey));
      if (owner) { if (owner.id !== proj.activeLightId || S().ui.inspect !== 'light') selectLight(owner.id); }
      const kf = owner?.keyframes.find(k => k.id === lkey);
      if (kf) drag.current = { mode: 'lkey', keyId: lkey, grabbedBase: kf.time, pointerId: e.pointerId };
      return;
    }
    const lightId = el.getAttribute('data-light');
    if (lightId) { selectLight(lightId); return; } // click a light track header → select that light
    const keyId = el.getAttribute('data-key'); const camId = el.getAttribute('data-cam');
    try { (e.currentTarget as SVGElement).setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
    if (camId && camId !== proj.activeCameraId) S().selectCamera(camId);
    const { x: px, y: py } = svgPt(e);
    if (keyId) {
      if (e.shiftKey) { S().toggleSelectKey(keyId); drag.current = null; return; } // shift-click toggles, no drag
      const sel = S().ui.selectedKeyIds;
      // Grab inside a multi-selection → move the whole group; otherwise select this key alone.
      const moving = sel.includes(keyId) && sel.length > 1 ? sel : [keyId];
      if (!sel.includes(keyId)) S().selectKey(keyId);
      const times = new Map(S().active().keyframes.map(k => [k.id, k.time]));
      const base = moving.map(id => ({ id, t: times.get(id)! })).filter(b => b.t !== undefined);
      drag.current = { mode: 'key', keyId, grabbedBase: times.get(keyId)!, base, pointerId: e.pointerId };
    }
    else if (camId) { // grabbed the coloured track bar (not an edge handle) → slide the whole clip in time
      let targetId = camId;
      if (e.altKey) { const nid = S().duplicateCamera(camId); if (nid) targetId = nid; } // Alt+drag = duplicate, then move the copy
      const c = S().project.cameras.find(cc => cc.id === targetId)!;
      const [cs] = clipRange(c, dur);
      drag.current = { mode: 'clip-move', camId: targetId, baseStart: cs, grabT: timeFromX(px), moved: false, pointerId: e.pointerId };
    }
    else if (py < TOP_H) { drag.current = { mode: 'scrub', pointerId: e.pointerId }; S().setPlayhead(snap(timeFromX(px))); } // ruler → scrub
    else { if (S().ui.inspect === 'light') deselectLight(); drag.current = { mode: 'marquee', x0: px, y0: py, moved: false, pointerId: e.pointerId }; setMarquee({ x0: px, y0: py, x1: px, y1: py }); } // body → deselect light + drag-select
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return; const { x: px, y: py } = svgPt(e);
    if (drag.current.mode === 'scrub') S().setPlayhead(snap(timeFromX(px)));
    else if (drag.current.mode === 'key' && drag.current.base) {
      const dt = snap(timeFromX(px)) - drag.current.grabbedBase!; // frame-snapped delta, applied to the whole group
      S().moveKeysTimes(drag.current.base.map(b => ({ id: b.id, time: b.t + dt })));
    }
    else if (drag.current.mode === 'lkey') {
      moveLightKeysTimes([{ id: drag.current.keyId!, time: snap(timeFromX(px)) }]);
    }
    else if (drag.current.mode === 'clip' && drag.current.camId) {
      const c = proj.cameras.find(cc => cc.id === drag.current!.camId); if (!c) return;
      const [cs, ce] = clipRange(c, dur); const t = snapTime(timeFromX(px), drag.current.camId);
      if (drag.current.edge === 'start') S().setCameraClip(drag.current.camId, t, ce);
      else S().setCameraClip(drag.current.camId, cs, t);
    }
    else if (drag.current.mode === 'clip-move' && drag.current.camId) {
      const target = snapTime(drag.current.baseStart! + (timeFromX(px) - drag.current.grabT!), drag.current.camId);
      S().moveCameraClipTo(drag.current.camId, target); drag.current.moved = true;
    }
    else if (drag.current.mode === 'marquee') {
      drag.current.moved = true;
      const box = { x0: drag.current.x0!, y0: drag.current.y0!, x1: px, y1: py }; setMarquee(box);
      const lx = Math.min(box.x0, box.x1), hx = Math.max(box.x0, box.x1), ly = Math.min(box.y0, box.y1), hy = Math.max(box.y0, box.y1);
      S().setSelectedKeys(keyPositions.filter(k => k.x >= lx && k.x <= hx && k.y >= ly && k.y <= hy).map(k => k.id));
    }
  };
  // Drag teardown (pointerup / cancel / blur) is handled globally by the effect above.
  const onDbl = (e: React.MouseEvent) => {
    const id = (e.target as SVGElement).getAttribute('data-key'); if (id) { S().removeKey(id); return; }
    const lid = (e.target as SVGElement).getAttribute('data-lkey');
    if (lid) { const owner = proj.lights.find(l => l.keyframes.some(k => k.id === lid)); if (owner) selectLight(owner.id); removeLightKey(lid); }
  };
  const onCtx = (e: React.MouseEvent) => {
    const cid = (e.target as SVGElement).getAttribute('data-cam'); if (!cid) return; // right-click a camera bar → menu
    e.preventDefault(); S().selectCamera(cid); setCtxMenu({ camId: cid, x: e.clientX, y: e.clientY });
  };

  const diamond = (k: Keyframe, cx: number, cy: number, camId: string, half: number) => {
    const sel = st.ui.selectedKeyIds.includes(k.id);
    return <rect key={k.id} data-key={k.id} data-cam={camId} x={cx - half} y={cy - half} width={half * 2} height={half * 2}
      transform={`rotate(45 ${cx} ${cy})`} fill="#f5c400" stroke={sel ? '#ffffff' : '#8a6d00'} strokeWidth={sel ? 1.6 : 1} style={{ cursor: 'grab' }} />;
  };

  const lightDiamond = (k: Keyframe, cx: number, cy: number, color: string) => (
    <rect key={k.id} data-lkey={k.id} x={cx - 5} y={cy - 5} width={10} height={10}
      transform={`rotate(45 ${cx} ${cy})`} fill={color} stroke="#0008" strokeWidth={1} style={{ cursor: 'grab' }} />
  );

  const playing = tl.playing;
  const durInputVal = durUnit === 's' ? +dur.toFixed(2) : Math.round(dur * fps);
  const phx = x(tl.playhead);

  return (
    <div id="timeline">
      <div className="tl-top">
        <div className="transport">
          <button className="tbtn-round" title="Start" onClick={() => { S().setPlayhead(0); S().setPlaying(false); }}>⇤</button>
          <button className={'tbtn-round' + (playing ? '' : ' play')} title="Play/Pause"
            onClick={() => { if (tl.playhead >= dur) S().setPlayhead(0); S().setPlaying(!playing); }}>{playing ? '❚❚' : '▶'}</button>
          <button className="tbtn-round" title="Add key at playhead" onClick={keyAtPlayhead}>◆</button>
          <button className="tbtn-round" title="Delete selected keys (Del)"
            style={{ opacity: st.ui.selectedKeyIds.length ? 1 : 0.4 }}
            onClick={() => { if (st.ui.selectedKeyIds.length) S().removeKeys(st.ui.selectedKeyIds); }}>🗑</button>
        </div>
        <span className="tc" title={durUnit === 'f' ? 'Frame' : 'Timecode H;MM;SS;FF'}>{durUnit === 'f' ? Math.round(tl.playhead * fps) + ' f' : toTimecode(tl.playhead, fps)}</span>
        <div className="tl-spacer" />
        <label className="tl-field">fps
          <select value={fps} onChange={e => S().setFps(+e.target.value)}>
            {[24, 25, 30, 60].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="tl-field">Duration
          {durUnit === 'tc' ? (
            <input type="text" className="tc-input" value={durText ?? toTimecode(dur, fps)}
              title="Duration as timecode H;MM;SS;FF" placeholder="0;00;00;00"
              onChange={e => setDurText(e.target.value)}
              onBlur={() => { if (durText != null) { const v = fromTimecode(durText, fps); if (v != null) S().setDuration(v); setDurText(null); } }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDurText(null); }} />
          ) : (
            <input type="number" min={durUnit === 's' ? 0.1 : 1} step={durUnit === 's' ? 0.1 : 1} value={durInputVal}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) S().setDuration(durUnit === 's' ? v : v / fps); }} style={{ width: 60 }} />
          )}
          <div className="seg" style={{ marginLeft: 4 }}>
            <button className={durUnit === 's' ? 'sel' : ''} onClick={() => setDurUnit('s')}>s</button>
            <button className={durUnit === 'f' ? 'sel' : ''} onClick={() => setDurUnit('f')}>f</button>
            <button className={durUnit === 'tc' ? 'sel' : ''} title="Timecode H;MM;SS;FF" onClick={() => setDurUnit('tc')}>tc</button>
          </div>
        </label>
      </div>

      <div className="tl-scroll" ref={scrollRef} style={{ flex: 1 }} onScroll={e => setScrollLeft((e.currentTarget as HTMLDivElement).scrollLeft)}>
        <svg ref={svgRef} id="tl-svg" width={contentW} height={H} onPointerDown={onDown} onPointerMove={onMove} onDoubleClick={onDbl} onContextMenu={onCtx}>
          <rect x={0} y={0} width={contentW} height={TOP_H} fill="#101315" />
          {ticks.map(({ f, label }) => {
            const px = x(f / fps);
            return (
              <g key={f}>
                <line x1={px} y1={label ? TOP_H - 8 : TOP_H - 4} x2={px} y2={label ? H : TOP_H} stroke={label ? '#232a2f' : '#1a1e21'} />
                {label && <text x={px + 3} y={13} fill="#6b747c" fontSize={9} style={{ fontVariantNumeric: 'tabular-nums' }}>{durUnit === 'f' ? f : toTimecode(f / fps, fps)}</text>}
              </g>
            );
          })}

          {layout.map(({ c, headerY, exp, rows }) => {
            const cy = headerY + TRACK_H / 2; const active = c.id === proj.activeCameraId;
            const ks = c.keyframes;
            const [cs, ce] = clipRange(c, dur); const bs = x(cs), be = x(ce); const bw = Math.max(6, be - bs);
            return (
              <g key={c.id}>
                <rect data-cam={c.id} x={bs} y={headerY} width={bw} height={TRACK_H} rx={6}
                  fill={c.color} fillOpacity={active ? 0.9 : 0.4} style={{ cursor: 'grab' }} />
                {/* collapsed: one small rectangle per keyframe time (merged) to locate the keys */}
                {!exp && [...new Set(ks.map(k => Math.round(k.time * 1000)))].map(ms => {
                  const kx = x(ms / 1000);
                  return <rect key={ms} x={kx - 3} y={headerY + 9} width={6} height={TRACK_H - 18} rx={2}
                    fill="#f5c400" stroke="#8a6d00" strokeWidth={1} pointerEvents="none" />;
                })}
                <text x={bs + 14} y={cy + 4} fill={active ? '#ffffff' : '#e6e6ea'} fillOpacity={active ? 1 : 0.75} fontSize={11} pointerEvents="none">{exp ? '▾' : '▸'}</text>
                {/* colour swatch — click to recolour this camera's track */}
                <circle cx={bs + 36} cy={cy} r={6} fill={c.color} stroke="#0006" strokeWidth={1} pointerEvents="none" />
                <text x={bs + 50} y={cy + 4} fill={active ? '#ffffff' : '#e6e6ea'} fillOpacity={active ? 1 : 0.8} fontSize={12} pointerEvents="none">{c.name}</text>
                <rect data-toggle={c.id} x={bs + 6} y={headerY} width={24} height={TRACK_H} fill="none" pointerEvents="all" style={{ cursor: 'pointer' }} />
                <rect data-color={c.id} x={bs + 27} y={headerY} width={18} height={TRACK_H} fill="none" pointerEvents="all" style={{ cursor: 'pointer' }} />
                {/* clip trim handles — drag the bar edges to set this camera's on-air window (multi-camera cuts) */}
                <rect data-clip-start={c.id} x={bs} y={headerY} width={6} height={TRACK_H} rx={3} fill="#fff" fillOpacity={active ? 0.55 : 0.22} style={{ cursor: 'ew-resize' }}>
                  <title>Drag to set when this shot starts</title></rect>
                <rect data-clip-end={c.id} x={be - 6} y={headerY} width={6} height={TRACK_H} rx={3} fill="#fff" fillOpacity={active ? 0.55 : 0.22} style={{ cursor: 'ew-resize' }}>
                  <title>Drag to set when this shot ends</title></rect>

                {exp && rows.length > 0 && <rect x={bs} y={rows[0].ry - 2} width={bw} height={rows.length * ROW_H + 4} rx={6} fill={c.color} fillOpacity={0.10} />}
                {rows.map(({ def, ry }) => {
                  const rcy = ry + ROW_H / 2;
                  const grey = !!def.lock;
                  return (
                    <g key={def.label}>
                      <text x={bs + 32} y={rcy + 3} fill={grey ? '#6b6270' : '#9aa3ab'} fontSize={10}>{def.label}{def.lock ? ' ⚿' : ''}</text>
                      <line x1={bs} y1={ry + ROW_H - 1} x2={be} y2={ry + ROW_H - 1} stroke="#2a2130" />
                      {keysOf(c, def.ch).map(k => diamond(k, x(k.time), rcy, c.id, 5))}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {lightLayout.map(({ l, headerY, exp, rows }) => {
            const active = l.id === proj.activeLightId && st.ui.inspect === 'light';
            return (
              <g key={l.id}>
                <rect data-light={l.id} x={LEFT} y={headerY} width={contentW - LEFT - RIGHT} height={TRACK_H} rx={6}
                  fill={l.color} fillOpacity={active ? 0.30 : 0.14} style={{ cursor: 'pointer' }} />
                {/* collapsed → keyframe ticks on the header (merged by time), like camera tracks */}
                {!exp && [...new Set(l.keyframes.map(k => Math.round(k.time * 1000)))].map(ms => {
                  const kx = x(ms / 1000);
                  return <rect key={ms} x={kx - 3} y={headerY + 9} width={6} height={TRACK_H - 18} rx={2}
                    fill={l.color} stroke="#0008" strokeWidth={1} pointerEvents="none" />;
                })}
                <text x={LEFT + 14} y={headerY + TRACK_H / 2 + 4} fill="#e6e6ea" fontSize={11} pointerEvents="none">{exp ? '▾' : '▸'}</text>
                <circle cx={LEFT + 34} cy={headerY + TRACK_H / 2} r={5} fill={l.color} pointerEvents="none" />
                <text x={LEFT + 46} y={headerY + TRACK_H / 2 + 4} fill={active ? '#ffffff' : '#e6e6ea'} fillOpacity={active ? 1 : 0.8} fontSize={12} pointerEvents="none">{l.name} · light</text>
                <rect data-toggle={'light:' + l.id} x={LEFT + 6} y={headerY} width={26} height={TRACK_H} fill="none" pointerEvents="all" style={{ cursor: 'pointer' }} />
                {rows.map(({ def, ry }) => {
                  const rcy = ry + ROW_H / 2;
                  return (
                    <g key={def.label}>
                      <text x={LEFT + 32} y={rcy + 3} fill={def.lock ? '#6b6270' : '#9aa3ab'} fontSize={10}>{def.label}{def.lock ? ' ⚿' : ''}</text>
                      <line x1={LEFT} y1={ry + ROW_H - 1} x2={contentW - RIGHT} y2={ry + ROW_H - 1} stroke="#2a2130" />
                      {lightKeysOf(l, def.ch).map(k => lightDiamond(k, x(k.time), rcy, l.color))}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {marquee && <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
            width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
            fill="rgba(41,182,246,0.12)" stroke={PLAYHEAD} strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />}

          <line x1={phx} y1={TOP_H - 4} x2={phx} y2={H} stroke={PLAYHEAD} strokeWidth={1.5} />
          <path d={`M${phx - 8},${TOP_H - 12} L${phx + 8},${TOP_H - 12} L${phx},${TOP_H - 1} Z`} fill={PLAYHEAD} />
        </svg>
      </div>

      <div className="tl-zoom">
        <span className="tl-viz-label">Path colour</span>
        <button className={'btn-sm tl-viz height' + (st.ui.splineViz === 'height' ? ' on' : '')}
          title="Colour the camera path by height — yellow (low) → red (high)"
          onClick={() => S().setSplineViz(st.ui.splineViz === 'height' ? 'none' : 'height')}>Height</button>
        <button className={'btn-sm tl-viz speed' + (st.ui.splineViz === 'speed' ? ' on' : '')}
          title="Colour the camera path by speed — white (slow) → blue (fast)"
          onClick={() => S().setSplineViz(st.ui.splineViz === 'speed' ? 'none' : 'speed')}>Speed</button>
        <span className="mtn" style={{ marginLeft: 'auto' }}>▁</span>
        <input type="range" min={1} max={30} step={0.1} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} title="Zoom timeline" />
        <span className="mtn" style={{ fontSize: 13 }}>▂▄█</span>
        <button className="btn-sm tl-fit" title="Fit to view" onClick={() => setZoom(1)}>Fit</button>
      </div>

      {colorMenu && (
        <div style={{
          position: 'fixed', left: colorMenu.x, top: colorMenu.y, zIndex: 100,
          background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,.5)', padding: 8,
        }} onPointerDown={e => e.stopPropagation()}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 20px)', gap: 6 }}>
            {CAM_COLORS.map(col => {
              const sel = proj.cameras.find(c => c.id === colorMenu.camId)?.color === col;
              return <button key={col} title={col}
                onClick={() => { S().setCameraColor(colorMenu.camId, col); setColorMenu(null); }}
                style={{ width: 20, height: 20, borderRadius: '50%', background: col, cursor: 'pointer', padding: 0,
                  border: sel ? '2px solid #fff' : '1px solid #0006', boxShadow: sel ? '0 0 0 1px #0008' : 'none' }} />;
            })}
          </div>
        </div>
      )}

      {ctxMenu && (
        <div style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 100,
          background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,.5)', padding: 4, minWidth: 160,
        }} onPointerDown={e => e.stopPropagation()}>
          <button className="btn-sm btn-full" style={{ border: 'none', justifyContent: 'flex-start' }}
            onClick={() => { S().duplicateCamera(ctxMenu.camId); setCtxMenu(null); }}>Duplicate camera</button>
          <button className="btn-sm btn-full danger" style={{ border: 'none', justifyContent: 'flex-start' }}
            onClick={() => { S().removeCamera(ctxMenu.camId); setCtxMenu(null); }}>Delete camera</button>
        </div>
      )}
    </div>
  );
}

function keyAtPlayhead() {
  const st = S(); if (!st.project.cameras.length) return; // no camera → nothing to key
  const cam = st.active(); const t = st.project.timeline.playhead;
  const p = evaluate(cam, t);
  st.upsertKey('position', p.position, t, 'manual');
  if (!cam.target) st.upsertKey('rotation', p.rotation, t, 'manual');
  else if (cam.target.type === 'point') st.upsertKey('poi', poiPoint(cam, t), t, 'manual');
}
