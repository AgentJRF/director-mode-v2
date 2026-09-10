import { S } from '../store';
import { useRev } from './bits';
import { IcUndo, IcRedo } from './icons';

export default function Topbar() {
  useRev();
  const { width, height } = S().project.canvas;
  const canUndo = S().canUndo(); const canRedo = S().canRedo();
  return (
    <div id="topbar">
      <span className="brand">Director<span className="dot">.</span>mode</span>
      <span className="badge proto">prototype</span>
      <span className="badge">{width}×{height}</span>
      <button className="tbtn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => S().undo()}
        style={{ marginLeft: 10, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', color: canUndo ? 'var(--ink)' : 'var(--ink-3)', opacity: canUndo ? 1 : 0.55 }}><IcUndo size={18} /></button>
      <button className="tbtn" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => S().redo()}
        style={{ padding: '5px 9px', display: 'inline-flex', alignItems: 'center', color: canRedo ? 'var(--ink)' : 'var(--ink-3)', opacity: canRedo ? 1 : 0.55 }}><IcRedo size={18} /></button>
      <div className="top-spacer" />
      <button className="tbtn" title="AI — match camera from an image" onClick={() => S().setModal('ai-image')}>✦ AI image</button>
      <button className="tbtn" title="AI — animation from a video" onClick={() => S().setModal('ai-video')}>✦ AI video</button>
      <button className="tbtn" onClick={() => S().setModal('export')}>Export</button>
    </div>
  );
}
