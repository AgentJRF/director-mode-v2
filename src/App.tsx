import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Scene from './three/Scene';
import Topbar from './ui/Topbar';
import Toolbar from './ui/Toolbar';
import Inspector from './ui/Inspector';
import Timeline from './ui/Timeline';
import HUD from './ui/HUD';
import ViewPills from './ui/ViewPills';
import Modals from './ui/Modals';
import { Toast, Loading } from './ui/Toast';
import ErrorBoundary from './ui/ErrorBoundary';
import CameraPovPreview from './three/CameraPovPreview';
import SplineOverlay from './three/SplineOverlay';
import MultiviewOverlay from './three/MultiviewOverlay';
import MarqueeOverlay from './three/MarqueeOverlay';
import { S, useStore } from './store';
import { R3 } from './three/shared';
import type { Tool } from './types';

const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function App() {
  const rev = useStore(s => s.rev);
  const split = useStore(s => s.ui.split);
  const canvasWH = useStore(s => s.project.canvas);
  const frameRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // Resizable panels — inspector width & timeline height & split divider (persisted).
  const [insW, setInsW] = useState(() => cl(+(localStorage.getItem('dm.insW') || '300'), 220, 560));
  const [tlH, setTlH] = useState(() => cl(+(localStorage.getItem('dm.tlH') || '224'), 120, 640));
  const [splitPos, setSplitPos] = useState(() => cl(+(localStorage.getItem('dm.splitPos') || '0.5'), 0.2, 0.8));
  useEffect(() => { localStorage.setItem('dm.insW', String(insW)); }, [insW]);
  useEffect(() => { localStorage.setItem('dm.tlH', String(tlH)); }, [tlH]);
  useEffect(() => { localStorage.setItem('dm.splitPos', String(splitPos)); }, [splitPos]);

  const dragSplit = (e: React.PointerEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement; handle.classList.add('drag');
    const rect = stageRef.current!.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => setSplitPos(cl((ev.clientX - rect.left) / rect.width, 0.2, 0.8));
    const onUp = () => { handle.classList.remove('drag'); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const dragPanel = (axis: 'v' | 'h') => (e: React.PointerEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement; handle.classList.add('drag');
    const onMove = (ev: PointerEvent) => {
      if (axis === 'v') setInsW(cl(window.innerWidth - ev.clientX, 220, Math.min(560, window.innerWidth - 220)));
      else setTlH(cl(window.innerHeight - ev.clientY, 120, Math.min(640, window.innerHeight - 160)));
    };
    const onUp = () => { handle.classList.remove('drag'); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  useLayoutEffect(() => {
    const fit = () => {
      const frame = frameRef.current, wrap = wrapRef.current; if (!frame || !wrap) return;
      const { width, height } = S().project.canvas; const ar = width / height;
      const availW = frame.clientWidth - 44, availH = frame.clientHeight - 44;
      let w = availW, h = w / ar; if (h > availH) { h = availH; w = h * ar; }
      wrap.style.width = Math.floor(w) + 'px'; wrap.style.height = Math.floor(h) + 'px';
    };
    R3.wrap = wrapRef.current; fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [rev, insW, tlH, splitPos, split]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const st = S();
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); st.redo(); return; }
      if (e.key === 'Escape' && st.ui.interp) { st.cancelInterp(); return; }
      if (e.key === ' ') { e.preventDefault(); const tl = st.project.timeline; if (tl.playhead >= tl.duration) st.setPlayhead(0); st.setPlaying(!tl.playing); }
      const map: Record<string, Tool> = { v: 'select', c: 'camera', t: 'target' };
      if (map[e.key]) st.setTool(map[e.key]);
      if (e.key === 'r') st.setGizmoSpace(st.ui.gizmoSpace === 'world' ? 'local' : 'world');
      if (e.key === '4' && st.ui.viewMode === 'scene') st.setMultiview(!st.ui.multiview);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.ui.targetSelected && st.active().target) st.setTarget(null); // selected target badge → remove target
        else if (st.ui.selectedKeyIds.length) st.removeKeys(st.ui.selectedKeyIds);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div id="app" style={{ gridTemplateColumns: `48px 1fr ${insW}px`, gridTemplateRows: `40px 1fr ${tlH}px` }}>
      <Topbar />
      <Toolbar />
      <div className="splitter splitter-v" style={{ right: insW }} onPointerDown={dragPanel('v')} title="Drag to resize the inspector" />
      <div className="splitter splitter-h" style={{ right: insW, bottom: tlH }} onPointerDown={dragPanel('h')} title="Drag to resize the timeline" />
      <div id="stage" className={split ? 'split' : ''} ref={stageRef}>
        <div id="viewport-frame" ref={frameRef} style={split ? { right: `${(1 - splitPos) * 100}%` } : undefined}>
          <div id="canvas-wrap" ref={wrapRef}>
            <ErrorBoundary label="Scene 3D">
              <Scene />
            </ErrorBoundary>
            <SplineOverlay />
            <MultiviewOverlay />
            <MarqueeOverlay />
          </div>
        </div>
        {split && (
          <>
            <div className="split-divider" style={{ left: `${splitPos * 100}%` }} onPointerDown={dragSplit} title="Drag to resize the split" />
            <div className="split-right" style={{ width: `${(1 - splitPos) * 100}%` }}>
              <div className="split-cam" style={{ aspectRatio: `${canvasWH.width} / ${canvasWH.height}` }}>
                <span className="split-tag">Camera</span>
                <ErrorBoundary label="Camera preview"><CameraPovPreview /></ErrorBoundary>
              </div>
            </div>
          </>
        )}
        <HUD />
        <ViewPills />
        <Loading />
      </div>
      <Inspector />
      <Timeline />
      <Modals />
      <Toast />
    </div>
  );
}
