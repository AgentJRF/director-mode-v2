import { useStore } from '../store';
import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { round, clamp, EASES } from '../lib/eval';
import type { Ease } from '../types';

// re-render helper: subscribe to the store revision counter
export const useRev = () => useStore(s => s.rev);
export const grad = (a: string, b: string) => `linear-gradient(135deg,${a},${b})`;

// Photoshop/AE-style "scrubby" number field: drag left/right on the box to decrement/increment.
// A plain click (no drag) falls through to focusing the input for keyboard entry. Shift = fine (×0.25).
export function makeScrub(base: number, step: number, dec: number, onChange: (v: number) => void, min?: number, max?: number) {
  return (e: ReactPointerEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (document.activeElement === input) return; // already editing → let the click place the caret
    e.preventDefault();                            // suppress focus so a drag scrubs instead of typing
    const startX = e.clientX; let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;      // small movement = still a click
      moved = true;
      let v = base + dx * step * (ev.shiftKey ? 0.25 : 1);
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onChange(round(v, dec));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp); window.removeEventListener('blur', onUp);
      if (!moved) { input.focus(); input.select(); } // treat as a click → edit by keyboard
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp); window.addEventListener('blur', onUp);
  };
}

// Hand-editable numeric box: shows the (rounded) value; while focused it holds free text and commits
// a clamped value on blur / Enter, so typing isn't fought by the min/max clamp mid-keystroke. Drag to scrub.
export function NumInput({ value, min, max, step, dec, onChange }:
  { value: number; min: number; max: number; step: number; dec: number; onChange: (v: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? String(round(value, dec));
  const commit = () => { if (txt !== null) { const v = parseFloat(txt); if (!isNaN(v)) onChange(clamp(v, min, max)); setTxt(null); } };
  return (
    <input className="val-input" type="number" min={min} max={max} step={step} value={shown}
      onPointerDown={makeScrub(round(value, dec), step, dec, onChange, min, max)}
      onChange={e => setTxt(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTxt(null); }} />
  );
}

// A small speed-curve diagram for an ease (shared by the camera + light "speed curve presets").
export function EaseCurve({ ease }: { ease: Ease }) {
  const fn = EASES[ease] || EASES.linear; let d = ''; const N = 48;
  for (let i = 0; i <= N; i++) { const t = i / N; const y = fn(t); d += (i ? 'L' : 'M') + (t * 100).toFixed(1) + ',' + (100 - y * 100).toFixed(1) + ' '; }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={128}
      style={{ display: 'block', background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 6, marginTop: 8 }}>
      <line x1="0" y1="50" x2="100" y2="50" stroke="#1c2024" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1="50" y1="0" x2="50" y2="100" stroke="#1c2024" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={`${d} L100,100 L0,100 Z`} fill="rgba(242,163,60,0.14)" stroke="none" />
      <path d={d} fill="none" stroke="#f2a33c" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
