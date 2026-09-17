# Director Mode v2 — Technical Specifications

_Snapshot as of 2026-09-17. Companion docs: [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md),
[FEATURES.md](FEATURES.md), [LIGHTING-SETUP.md](LIGHTING-SETUP.md)._

## 1. Overview

Web prototype for **lighting + camera direction** around a 3D product (concept: **Adobe Dimension**).
Users place and animate cameras and compose studio lighting around a packshot (a backpack). Every
creation mode — manual, presets, interpolation, AI — writes **editable keyframes into a single
timeline**; there is no black box.

- **Live demo (static):** https://director-mode-v2.vercel.app/
- **Repo (private):** https://github.com/AgentJRF/director-mode-v2

## 2. Tech stack

| Layer | Technology |
|---|---|
| App | React 19, Vite 8, TypeScript |
| 3D | three.js 0.185, @react-three/fiber v9, @react-three/drei v10, @react-three/postprocessing |
| State | zustand — one central store is the single source of truth |
| Build | `tsc -b && vite build` → static `dist/` |
| Hosting | Vercel (static SPA, SPA fallback via `vercel.json`) |
| Product asset | glTF backpack, `public/asset/Outdoor_Bag_Blue_orange_V03.glb` (WebP 1K, ~41 MB) |
| Design | Adobe Spectrum dark theme, Adobe Clean font, Substance/Dimension-style chrome |

No CSS framework, no bundled UI kit — hand-rolled components + one global stylesheet.

## 3. Architecture

- **Single zustand store** (`src/store.ts`) holds `project` (cameras, lights, timeline, canvas,
  backdrop) and `ui` (tool, selection, view mode, etc.), plus debounced **undo/redo** snapshots.
- **Imperative-per-frame rendering**: React re-renders only on structural changes (a `rev` bump);
  per-frame values (camera/light pose, intensity, aim) are written directly onto three.js objects in
  `useFrame`, so scrubbing/playback don't thrash React.
- **Channel-based evaluation**: animatable values are `Keyframe`s on channels
  (`position`, `rotation`, `focalLength`, `poi`, `aperture`, `motionBlur`, `intensity`).

Key files:

```
src/
  store.ts               project + ui state, undo/redo
  types.ts               Camera, Light, Keyframe, GoboPattern, Project…
  lib/
    eval.ts              camera eval (cubic Bézier + arc-length reparam, eases, look-at)
    lightEval.ts         per-channel light eval
    lights.ts            light CRUD, setters, keyframe-aware editors
    lightRig.ts          default rig + makeLight factory
    lightPresets.ts      declarative lighting presets (added as named groups)
    gobo.ts              gobo masks (procedural + image + custom), textures, thumbnails
    presets.ts           camera move presets
    aiMatch.ts           AI calls (/api) + client-side fallback
  three/
    Scene.tsx            Canvas, view modes, ground/grid, VSM shadows, DoF
    SceneLights.tsx      renders project.lights as r3f lights, gobo map, shadows
    LightGizmos.tsx      move pivot + POI crosshair for the selected light
    LightInfluence.tsx   per-type influence wireframes (cone/rect/point/…)
    LightMarkers.tsx     clickable light markers
    Product.tsx          loads the .glb and frames the shot
  ui/
    Outliner.tsx         Scene panel (Scene background, Cameras, Lights, Objects)
    Inspector.tsx        camera inspector
    LightInspector.tsx   light inspector (+ gobo, environment)
    LightingPresets.tsx  preset gallery (lit-sphere thumbnails)
    Timeline.tsx         camera + light tracks
    Toolbar.tsx, Modals.tsx  tools + AI modals
```

## 4. Data model (core types)

- **`Camera`**: `transform {position, rotation}`, `optics {focalLength, aperture, motionBlurShutter,
  focusPoint}`, `target` (object|point look-at), `keyframes[]`, optional on-air `clip {start,end}`.
- **`Light`**: `kind` (`spot|directional|point|ambient|hemisphere|area|env`), `color`, `intensity`,
  `transform`, `target`, spot/point optics (`angle`, `penumbra`, `distance`, `decay`), area
  (`width`, `height`), `gobo`, `castShadow`, `keyframes[]`, optional `group` (preset grouping),
  env fields (`hdri`, `envRotation`, `colorize`).
- **`Keyframe`**: `time`, `channel`, `value` (Vec3 | number), `ease`, `source`
  (`manual|preset|interpolation|aiVideo|aiLight`), Bézier `tangentIn/Out`.
- **`Project.backdrop`**: `{enabled, color}` — the scene background / shadow-catching studio ground.

## 5. Rendering pipeline (all real three.js)

- **Renderer**: `Canvas shadows={{ type: VSMShadowMap }}`, ACES-ish exposure, real perspective camera
  driven by state (focal length → fov on a 36 mm sensor).
- **Soft shadows**: VSMShadowMap + per-light `shadow-radius` / `blurSamples` (three 0.185 deprecates
  PCFSoftShadowMap, which fell back to hard PCF — hence the switch).
- **Depth of field + motion blur**: postprocessing `EffectComposer` (DoF driven by aperture + focus
  point; motion blur is a global on/off).
- **Lights**: real `SpotLight`, `RectAreaLight` (area; needs `RectAreaLightUniformsLib.init()`, no
  native shadows → a co-located near-zero-intensity spot casts its shadow), `PointLight`,
  `HemisphereLight` (dome), `DirectionalLight`, `AmbientLight`.
- **Gobos**: real projected cookies via `spotLight.map`. Masks are drawn to a canvas; **Scale,
  Rotation, Softness and Contrast are baked into that canvas** (three ignores a `SpotLight.map`
  texture matrix), rebuilt when the params change.
- **Environment / IBL**: real — an uploaded `.hdr/.exr` (or equirect image) → PMREM → `scene.environment`.

## 6. Feature areas

- **Camera**: multi-camera, object/point targets, focal/aperture, focus pick, DoF, motion blur;
  4 views (Camera POV, Scene editor, Split, Quad); move presets (orbit/arc/push/crane/dolly-zoom),
  A→B interpolation; single editable timeline with Bézier handles + ease curves; multi-camera clips.
- **Lighting**: lights as first-class animatable entities; types Area/Spot/Dome/Point (+ Environment);
  per-type influence gizmos; gobos (procedural + image + custom upload with thumbnail); lighting
  presets added as named groups (Three-point, Gobo, Golden hour, Softbox, Dramatic, Noon) + Save
  preset; scene background section; soft shadows.
- **Export**: WebM video + PNG frame capture (real, via canvas / MediaRecorder). MP4/ProRes are
  targeted for a final version, not implemented.

## 7. What is REAL vs FAKED

**Real (fully implemented, not mocked):**

- All 3D rendering, lights, shadows (VSM), gobos, DoF, motion blur, IBL/environment.
- Camera + light animation: real Bézier arc-length evaluation on a real timeline; undo/redo.
- Lighting/camera **presets**: real — they generate genuine, editable `Light`/`Keyframe` data
  (never a canned image).
- **Prompt → camera** and **Prompt → lighting**: real, but **rule-based** — deterministic local
  parsing of keywords/modifiers into a pose or rig. Runs offline; **does not call an LLM**. (So it is
  "AI-styled" UX backed by handwritten heuristics, not a model.)
- Export (WebM/PNG).

**Faked / mocked / assisted:**

- **AI vision flows** — image → camera pose, reference image → light rig, environment generation.
  Behaviour depends on what's available (see §8):
  - With `ANTHROPIC_API_KEY` (dev `.env`) **or** a logged-in local `claude` CLI → **real Claude
    vision** analysis.
  - Otherwise → a **local heuristic** estimate, and/or **baked "demo" results keyed off the uploaded
    file name** (Wizard-of-Oz: e.g. a filename containing `backpack` returns a curated ¾-back pose).
    This is the faked path used for offline demos.
- **On the static Vercel deploy** there is **no server**, so *all* AI image/vision flows use the
  **client-side fallback** (heuristic / deterministic estimate) — i.e. demo-grade, never real vision.
- The product asset is a **real** Adobe glTF (not procedural); only its textures were recompressed
  (WebP 1K) to lighten the web download.

## 8. AI backend & fallback chain

Dev-only endpoints (Vite middleware, `vite.config.ts`): `/api/match-camera` (image → pose) and
`/api/match-motion` (video → motion). Resolution order, per request:

1. **Demo override** — baked result keyed by uploaded file name (Wizard-of-Oz).
2. **`ANTHROPIC_API_KEY`** set → real Claude vision.
3. Local **`claude` CLI** logged in → real analysis via CLI.
4. **Heuristic** — deterministic local estimate (`mocked: true`).

Client (`lib/aiMatch.ts`) POSTs to these endpoints and, on failure (`catch { /* no dev server */ }`,
i.e. static deploy or build), **falls back to a client-side estimate** — so the shipped link works
with no server and no key.

## 9. Build & deploy

- `npm install`; `npm run dev` (Vite, http://localhost:5173); `npm run build` → `dist/`.
- **Vercel**: static import of the GitHub repo; `vercel.json` sets build/output + SPA fallback;
  auto-redeploys on every push to `main`. First load ≈ 41 MB (asset) + ~0.5 MB gz JS.
- **Access protection**: on the Hobby plan, shared-password protection is Pro-only; Vercel
  Authentication (owner-only) is free. The public URL otherwise exposes the Adobe asset + fonts.

## 10. Known limitations / gotchas

- three 0.185: PCFSoftShadowMap deprecated → VSM used for soft shadows.
- `RectAreaLight`: no native shadows (shadow via a proxy spot), affects Standard/Physical materials only.
- `SpotLight.map` ignores the texture matrix → gobo scale/rotation are baked into the canvas.
- JS bundle > 500 KB (no code-splitting yet); the 41 MB asset dominates first load.
- OneDrive-hosted working copy: possible sync locks; the local dev server can drop in the background.
- Windows: watch filename casing in imports; git identity pinned to Jean Fournery <fournery@adobe.com>.
