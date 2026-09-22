# Director Mode v2 — Project Summary

_Up-to-date overview as of 2026-09-22. Details: [TECHNICAL-SPECS.md](TECHNICAL-SPECS.md),
[FEATURES.md](FEATURES.md) (camera), [LIGHTING-SETUP.md](LIGHTING-SETUP.md) (lighting integration),
[HANDOFF.md](HANDOFF.md), [REVIEW-CHECKLIST.md](REVIEW-CHECKLIST.md), [ACCESS.md](ACCESS.md)._

## 1. In one sentence

A web prototype for **lighting + camera direction** around a 3D product (concept: **Adobe
Dimension**): place/animate **cameras** and compose the **lighting** around a packshot (a backpack),
via manual modes, presets and AI — all converging on **one editable keyframe timeline** (no black box).

## 2. Links

- **Repo** (private): https://github.com/AgentJRF/director-mode-v2
- **Live demo** (Vercel, static): https://director-mode-v2.vercel.app/
  ⚠️ Public URL → exposes Adobe IP (asset + fonts). Protection recommended (see §9).

## 3. Stack

| Layer | Technology |
|---|---|
| App | React 19 + Vite 8 + TypeScript |
| 3D | three 0.185 · @react-three/fiber v9 · drei v10 · postprocessing |
| State | zustand (single store = source of truth) |
| Asset | `public/asset/Outdoor_Bag_Blue_orange_V03.glb` (WebP 1K, ~41 MB) |
| Design | Adobe Spectrum dark · Adobe Clean font · Substance/Dimension-style icons |

## 4. Run locally

```bash
npm install
npm run dev      # Vite → http://localhost:5173
npm run build    # tsc -b && vite build → dist/ (static)
```

No asset step required: the `.glb` and fonts are committed in the repo.

## 5. Viewport & camera (foundation)

- 4 views: **Camera** (final POV, DoF + motion blur), **Scene** (free editing: frustum + animation
  spline + keyframe handles + World/Object gizmo), **Split** (Scene | Camera), **Quad**.
- Multi-camera (create, duplicate, hide, ID colour); object/point target (look-at); focal/aperture
  optics; single **timeline** with Bézier keyframes + speed (ease) curves.
- Camera creation modes: manual, move presets (orbit/arc/push/crane…), A→B interpolation.
- **Spline editing** (Scene view): drag anchor spheres to reshape the path; rubber-band **multi-select**
  anchors, then drag near any selected anchor to **move the whole selection together** (Shift = height).
- Tools: Select, Camera/orbit, Target, Pick focus, Interpolate (the unused Light tool was removed).

## 6. Lighting

- **Lights are first-class store entities** (siblings of cameras), animatable on the **same timeline**
  (`position` / `poi` / `intensity` channels), with undo/redo.
- **Creatable types**: **Area** (RectAreaLight), **Spot**, **Dome** (hemisphere), **Point** — plus
  `Environment` (IBL/HDRI) and the default rig's internal kinds (ambient/directional).
- **Influence gizmos** (Scene view, selected light): spot cone, area rectangle + normal, point star,
  directional arrow; clickable markers for the others. Move gizmo with World/Object space like the
  camera; lock onto an asset via the Target tool.
- **Gobos** (spots): procedural **Blinds/Window** + image gobos **Foliage 1/2, Caustics 1/2**
  (1024² masks in `public/gobos/`) + **custom upload** (with thumbnail, HDRI-picker style). **Scale /
  Rotation / Softness / Contrast** are baked into the gobo canvas (three ignores a `SpotLight.map`
  texture matrix).
- **Lighting presets** (lit-sphere thumbnail cards): Three-point, Gobo, Golden hour, Softbox,
  Dramatic, Neon. Applying a preset **replaces the previously-applied preset** (its named group) but
  **keeps manually-placed lights and the Environment** untouched; groups are collapsible/deletable and
  **Save preset** stores custom rigs.
- **Soft shadows**: renderer uses **VSMShadowMap** + `shadow-radius`/`blurSamples`.
- **Scene background**: dedicated section at the top of the Scene panel (toggle + colour) with a
  shadow-catching ground — moved out of the Environment inspector for discoverability.

## 7. AI (works without a key)

- **Prompt → camera** and **prompt → lighting**: fully offline (local, rule-based prompt parsing —
  not an LLM call).
- **Image → camera pose**, **reference → light rig**, **environment generation**: in dev, hit
  `/api/match-camera` and `/api/match-motion` (real Claude vision if `ANTHROPIC_API_KEY` in `.env`,
  else local `claude` CLI, else a **heuristic**, plus **baked demo results by filename** — Wizard-of-Oz).
- **On the static deploy** (Vercel): no backend → the client **automatically falls back to a
  browser-side estimate** (`aiMatch.ts`). AI flows stay usable with no server and no key (demo-grade).
- **Review previews**: lighting-from-image/prompt shows a clean **front-on render** of the lit product
  (via `StudioCanvas`, no gizmos, consistent framing); env-from-image shows the **generated 360°
  panorama** below the reference (vertical layout suited to a wide equirectangular image).

## 8. Architecture — key files

```
src/
  store.ts                 zustand store (project + ui), undo/redo
  types.ts                 Camera, Light, Keyframe, GoboPattern, Project…
  lib/
    eval.ts                camera eval (Bézier arc-length, eases, look-at)
    lightEval.ts           per-channel light eval
    lights.ts              light CRUD + setters + keyframe-aware editors
    lightRig.ts            default rig + makeLight
    lightPresets.ts        declarative lighting presets (+ group add)
    gobo.ts                gobo masks (procedural + image + custom), textures & thumbnails
    presets.ts             camera move presets
    aiMatch.ts             AI (/api call + client fallback)
  three/
    Scene.tsx              Canvas, views, ground/grid, VSM, DoF
    SceneLights.tsx        renders project.lights (r3f), gobo map, shadows, area proxy
    LightGizmos.tsx        pivot + POI of the selected light
    LightInfluence.tsx     per-type influence wireframes
    LightMarkers.tsx       clickable markers
    Product.tsx            .glb load + framing
  ui/
    Outliner.tsx           Scene panel (Scene background, Cameras, Lights, Objects)
    Inspector.tsx          camera inspector
    LightInspector.tsx     light inspector (+ gobo, env)
    LightingPresets.tsx    preset gallery (thumbnails)
    Timeline.tsx           camera + light timeline
    Toolbar.tsx / Modals.tsx  tools + AI modals
```

## 9. Deployment (Vercel)

- Static via `vercel.json` (build `npm run build`, output `dist`, SPA fallback). Import the GitHub
  repo → auto-redeploy on every push to `main`.
- **Protection**: on the **Hobby** plan, shared-password protection is **not** available (Pro only).
  Alternatives: Vercel Authentication (free, owner-only), upgrade to **Pro**, or an app-side password
  gate (soft — does not protect the static files).

## 10. Status & next steps

- **Done**: camera foundation, full lighting (types + gizmos + gobos + presets + soft shadows +
  scene background), offline/mocked AI, Vercel deploy, lightened asset.
- **To validate** ([REVIEW-CHECKLIST.md](REVIEW-CHECKLIST.md)): AI image/reference pass (needs
  reference-image uploads), timeline/area items.
- **Ideas**: thumbnails for gobo presets, shadow contact-hardening, link protection (Pro / gate),
  heavier `.glb` decimation if an ultra-light link is needed.

## 11. Notes / gotchas

- **OneDrive**: the local copy is OneDrive-synced — possible sync lag; the dev server sometimes drops
  in the background, and **Vite's file watcher can miss an edit** so it serves stale code. If a change
  isn't showing, **fully restart the server** (`npm run dev`) — a browser hard-reload alone isn't enough.
  When in doubt, test on **Vercel** (fresh build from the repo) or from a fresh copy of the zip.
- **Filename casing** (Windows): keep imports exact (`lightRig.ts` lowercase).
- **Git identity**: Jean Fournery <fournery@adobe.com>.
