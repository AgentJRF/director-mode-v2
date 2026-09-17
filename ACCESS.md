# Accessing "Director Mode v2" — demo procedures

Repo: `git@github.com:AgentJRF/director-mode-v2.git` (private) · default branch: **`main`**
Everything is up to date on `main` (product asset + Adobe Clean font **committed in the repo**, AI mocked without a key).

**🔗 Shareable demo link (nothing to install)**: https://director-mode-v2.vercel.app/ — hosted on Vercel, redeployed on every `git push` (demo AI baked client-side).

> ℹ️ For the **fullest** version, run with `npm run dev`. The "rich" **AI** vision flows
> (image → camera pose, reference → light rig) are **dev-server** endpoints. In a static
> build / on Vercel they automatically fall back to a browser-side estimate (demo) — prompts
> and baked poses still work.

---

## 1. Locally (recommended for YOUR demos — most reliable, offline)

Prerequisite: **Node.js 20+**.

- **Simplest (Windows)**: in the project folder, double-click **`start-dev.cmd`**
  (it adds Node to PATH and starts the server).
- **Or in a terminal**:
  ```bash
  npm install
  npm run dev
  ```
- Open **http://localhost:5173** in Chrome.

> If it fails with **port 5173 already in use**: close the Claude session / Claude preview
> (it uses that port), then re-run.

You can also start from the portable archive (`director-mode-v2.zip`): unzip, then `npm install && npm run dev`.

---

## 2. GitHub Codespaces (demo/test without installing anything, in the browser)

1. Repo page → **`Code ▸ Codespaces ▸ Create codespace on main`**.
2. GitHub builds the container, runs `npm install`, then starts `npm run dev` **automatically**.
3. Port **5173** is forwarded and the preview **opens by itself** → the full app (AI included) runs.

Nothing to configure: the `.devcontainer` handles it. (Codespaces is free up to a generous monthly quota.)

---

## 3. StackBlitz (quick shareable link)

Open:
```
https://stackblitz.com/github/AgentJRF/director-mode-v2
```
This clones the repo and runs `npm run dev` **in the browser**. Ideal for sending a link.

---

## 4. Clone + run on another machine

```bash
git clone git@github.com:AgentJRF/director-mode-v2.git
cd director-mode-v2
npm install
npm run dev        # http://localhost:5173
```
(No need to fetch the asset separately: it is committed in the repo.)

---

## Granting access to colleagues (private repo)

The methods above require **access to the private repo**:

1. GitHub → repo `director-mode-v2` → **Settings ▸ Collaborators ▸ Add people**.
2. Add the colleague's **GitHub account** (Read role is enough to test).
3. They accept the invite, then can: open the StackBlitz link / create a Codespace / clone.

---

## Protecting the Vercel link

The deployment is on the **Hobby** (free) plan:

- Shared password (Password Protection): **Vercel Pro only**.
- Vercel Authentication (free): access limited to the Vercel account owner.
- Setting: Vercel → Project ▸ Settings ▸ Deployment Protection.

---

## Quick troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Port 5173 already in use" | The Claude preview is running — close it, then re-run `npm run dev`. |
| `node` not found in the terminal | Use `start-dev.cmd`, or add `C:\Program Files\nodejs` to PATH. |
| The backpack doesn't show on first load | The glTF (~41 MB) is still loading — wait / reload the page. |
| AI "Analyze" doesn't respond | You are in a static build. Re-run in **`npm run dev`**. |

---

## What the proto shows

- **4 views**: ◉ Camera (final render + bokeh, **pure preview**) · ⬚ Scene (free editing, gizmo, infinite grid) · ▥ Split (Scene + Camera) · ⊞ Quad (Persp / Top / Front / Side).
- **Lighting**: Area / Spot / Dome / Point lights with influence gizmos, gobos (procedural + image + custom), lighting presets, soft shadows, scene background.
- **Create a move**: manual, presets (orbit / arc / push / crane / dolly zoom…), A→B interpolation, or **AI** (image → camera pose, reference → light rig — mocked, no key needed).
- **Single timeline** of editable keyframes · **Export** WebM / PNG (MP4 / ProRes targeted for a final version).
- UI aligned with **Adobe Spectrum / Adobe Dimension** (Adobe Clean font, Spectrum 2 icons).
