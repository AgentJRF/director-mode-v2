import { S } from '../store';
import { useRev } from './bits';
import { IcSelect, IcCamera, IcTarget, IcEyedropper, IcInterp } from './icons';
import type { Tool } from '../types';
import type { ReactNode } from 'react';

// Primary nav/edit tools (above the separator).
const TOP_TOOLS: { id: Tool; icon: ReactNode; title: string }[] = [
  { id: 'select', icon: <IcSelect size={17} />, title: 'Select (V)' },
  { id: 'camera', icon: <IcCamera size={17} />, title: 'Camera / orbit (C)' },
];

export default function Toolbar() {
  useRev();
  const tool = S().ui.tool;
  const picking = S().ui.focusPicking;
  return (
    <div id="toolbar">
      {TOP_TOOLS.map(t => (
        <button key={t.id} className={'tool' + (tool === t.id ? ' active' : '')} title={t.title}
          onClick={() => S().setTool(t.id)}>{t.icon}</button>
      ))}
      <div className="tool-sep" />
      <button className={'tool' + (tool === 'target' ? ' active' : '')} title="Target (T)"
        onClick={() => S().setTool('target')}><IcTarget size={17} /></button>
      <button className={'tool' + (tool === 'light' ? ' active' : '')} title="Light (L)"
        onClick={() => S().setTool('light')}>
        <svg viewBox="0 0 18 18" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2.5a4.2 4.2 0 0 0-2.4 7.6c.5.4.8.9.8 1.5h3.2c0-.6.3-1.1.8-1.5A4.2 4.2 0 0 0 9 2.5Z"/><path d="M7.4 13.4h3.2M7.8 15h2.4"/></svg>
      </button>
      <button className={'tool' + (picking ? ' active' : '')} title="Pick focus point"
        onClick={() => S().setFocusPicking(!picking)}><IcEyedropper size={17} /></button>
      <button className={'tool' + (S().ui.interp ? ' active' : '')} title="Interpolate — click camera A then B (A→B)"
        onClick={() => (S().ui.interp ? S().cancelInterp() : S().startInterp())}><IcInterp size={17} /></button>
    </div>
  );
}
