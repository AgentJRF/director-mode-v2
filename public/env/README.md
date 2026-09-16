# Baked environment maps (wizard-of-oz)

Drop equirectangular (360°, ~2:1) panos here. They're used by **✦ AI → Env light**
to "generate" an environment from a reference photo (matched by file-name — see
`ENV_DEMO` in `src/ui/Modals.tsx`).

Expected file:
- `mountain-sunset.png` — golden-hour mountain pano, used for backpack / mountain / sunset references.

LDR `.jpg`/`.png`/`.webp` load as sRGB equirect; `.exr`/`.hdr` load as HDR.
