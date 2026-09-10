import { S } from '../store';
import { useRev } from '../ui/bits';

// DOM overlay drawn over #canvas-wrap in quad multiview: 50% separators + corner labels.
// Purely visual (pointer-events: none) — the GL quadrants are rendered by MultiviewRenderer.
const LABELS: { key: string; text: string; style: React.CSSProperties }[] = [
  { key: 'persp', text: 'Perspective', style: { top: 6, left: 8 } },
  { key: 'top', text: 'Top', style: { top: 6, right: 8 } },
  { key: 'front', text: 'Front', style: { bottom: 6, left: 8 } },
  { key: 'side', text: 'Side', style: { bottom: 6, right: 8 } },
];

export default function MultiviewOverlay() {
  useRev();
  const ui = S().ui;
  if (ui.viewMode !== 'scene' || !ui.multiview) return null;
  const line: React.CSSProperties = { position: 'absolute', background: 'rgba(120,130,140,0.45)' };
  const label: React.CSSProperties = {
    position: 'absolute', fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
    textTransform: 'uppercase', color: '#9aa3ab', textShadow: '0 1px 2px #000', padding: '2px 4px',
  };
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      <div style={{ ...line, left: '50%', top: 0, width: 1, height: '100%' }} />
      <div style={{ ...line, top: '50%', left: 0, height: 1, width: '100%' }} />
      {LABELS.map(l => <div key={l.key} style={{ ...label, ...l.style }}>{l.text}</div>)}
    </div>
  );
}
