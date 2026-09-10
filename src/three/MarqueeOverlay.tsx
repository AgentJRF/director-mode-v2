import { useRev } from '../ui/bits';
import { viewMarquee } from './shared';

// Non-interactive DOM overlay that draws the viewport selection rectangle (set by the Select tool in
// SceneGizmos / useMultiviewInput). Rect is in #canvas-wrap-relative pixels.
export default function MarqueeOverlay() {
  useRev();
  const r = viewMarquee.rect;
  if (!r) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, border: '1px dashed #29b6f6', background: 'rgba(41,182,246,0.12)' }} />
    </div>
  );
}
