import type { Light, Vec3 } from '../types';
import type { PresetLightSpec, LightRole } from './lightPresets';
import { S, PIVOT } from '../store';
import { uid, clamp, OBJECT_FRAME } from './eval';

// User-saved lighting presets: a snapshot of the current working lights (+ environment settings),
// persisted in localStorage so they survive reloads and appear alongside the built-in presets.
export interface UserLightPreset {
  id: string;
  name: string;
  lights: Light[];   // working lights (env excluded — the scene keeps its own env, we just reapply its settings)
  env?: { intensity: number; color: string; colorize: boolean; envRotation: number };
}

const KEY = 'dm.userLightPresets.v1';
export function loadUserPresets(): UserLightPreset[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function persist(list: UserLightPreset[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / private mode → in-memory only */ } }

// Snapshot the current lighting as a new user preset.
export function saveCurrentAsPreset(name: string): void {
  const st = S(); const p = st.project;
  const working = p.lights.filter(l => l.kind !== 'env');
  if (!working.length) { st.toast('Add some lights first'); return; }
  const env = p.lights.find(l => l.kind === 'env');
  const preset: UserLightPreset = {
    id: uid(), name: (name || '').trim() || 'My preset',
    lights: structuredClone(working),
    env: env ? { intensity: env.intensity, color: env.color, colorize: !!env.colorize, envRotation: env.envRotation ?? 0 } : undefined,
  };
  persist([...loadUserPresets(), preset]);
  st.bump(); st.toast(`Saved "${preset.name}"`);
}

export function deleteUserPreset(id: string) { persist(loadUserPresets().filter(p => p.id !== id)); S().bump(); }

// Apply a user preset: replace the working lights with fresh clones, keep the env but reapply its saved
// settings. Mirrors applyLightPreset (keeps cameras + the env entity, swaps the working rig).
export function applyUserPreset(id: string) {
  const preset = loadUserPresets().find(p => p.id === id); if (!preset) return;
  const st = S(); const p = st.project;
  const rig = structuredClone(preset.lights).map(l => ({ ...l, id: uid(), keyframes: l.keyframes.map(k => ({ ...k, id: uid() })) }));
  const env = p.lights.filter(l => l.kind === 'env');
  if (preset.env) env.forEach(e => { e.intensity = preset.env!.intensity; e.color = preset.env!.color; e.colorize = preset.env!.colorize; e.envRotation = preset.env!.envRotation; });
  p.lights = [...env, ...rig];
  const sel = rig[0]; if (sel) { p.activeLightId = sel.id; st.ui.inspect = 'light'; }
  st.bump(); st.toast(`${preset.name} applied`);
}

// Derive placement specs from a saved preset's lights so its card reuses the same schematic thumbnail as
// the built-in presets (position → az/el/distMul around the pivot; role guessed from the light's name).
export function userPresetSpecs(preset: UserLightPreset): PresetLightSpec[] {
  return preset.lights
    .filter(l => l.kind === 'spot' || l.kind === 'directional' || l.kind === 'area' || l.kind === 'point')
    .map(l => {
      const pos = l.transform.position;
      const d: Vec3 = [pos[0] - PIVOT.x, pos[1] - PIVOT.y, pos[2] - PIVOT.z];
      const dist = Math.hypot(d[0], d[1], d[2]) || 1;
      const role: LightRole = /rim|back/i.test(l.name) ? 'rim' : /fill/i.test(l.name) ? 'fill' : 'key';
      return {
        role, kind: l.kind,
        az: (Math.atan2(d[0], d[2]) * 180) / Math.PI,
        el: (Math.asin(clamp(d[1] / dist, -1, 1)) * 180) / Math.PI,
        distMul: dist / (OBJECT_FRAME.product || 6),
        intensity: l.intensity, color: l.color,
        gobo: l.gobo?.enabled ? { pattern: l.gobo.pattern } : undefined,
      };
    });
}
