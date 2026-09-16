import { useStore } from '../store';
import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { round, clamp } from '../lib/eval';

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
