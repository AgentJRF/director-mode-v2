# Director mode — prototype

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/AgentJRF/director-mode)

Prototype web interactif d'un espace d'animation et de composition de caméra pour un
logiciel 3D (concept **Adobe Substance 3D Stager**). On place et anime des caméras autour
d'un produit, via plusieurs façons de créer (manuel, presets, interpolation A→B, IA mockée),
toutes convergeant vers **une seule timeline de clés éditables**.

Cahier des charges (brief) :
`Studio - Studio_2026/Video/Director Mode - Camera mode Prototype/Documents/director-mode-prototype.md`

## Stack
- **React + Vite + TypeScript**
- **three.js** + **@react-three/fiber** + **@react-three/drei** + **@react-three/postprocessing**
- **zustand** (état central unique)
- Asset produit : glTF Stager (sac « barrel bag ») chargé depuis `public/asset/`

## Démarrer / démo
Prérequis : **Node.js 20+**. L'asset produit et la police Adobe Clean sont **dans le dépôt**
(privé) — rien à récupérer, ça tourne directement.

```bash
npm install
npm run dev        # http://localhost:5173
```

Puis ouvre **http://localhost:5173**. Sur Windows, si `node` n'est pas dans le PATH du terminal,
double-clique **`start-dev.cmd`** (il ajoute Node au PATH et lance le serveur).

> ⚠️ Pour une démo, lance **`npm run dev`** (pas `build`/`preview`) : les fonctions **IA**
> (match caméra image/vidéo) sont des endpoints du **serveur de dev** Vite — elles n'existent pas
> dans un build statique.

**Démo sans rien installer** : ouvre le lien **StackBlitz** en haut du README (il lance
`npm run dev` dans le navigateur). Dépôt privé ⇒ compte GitHub autorisé requis.

📄 **Toutes les procédures d'accès/démo** (local, Codespaces, StackBlitz, accès collègues,
dépannage) : voir **[`ACCESS.md`](ACCESS.md)**.

### IA — match caméra depuis une image (optionnel)
« ✦ AI image » (Topbar) : on **upload une photo** et l'IA estime l'angle, la focale et l'ouverture
pour composer le plan (sans poser de clés). L'appel passe par un **proxy local** du serveur Vite
(`POST /api/match-camera`, voir `vite.config.ts`), qui essaie dans l'ordre :

1. **`ANTHROPIC_API_KEY`** (dans `.env`) → API Claude vision. Pour une machine **sans** Claude Code
   (déploiement, autre poste). Clé gardée côté serveur, jamais exposée au client.
2. sinon **CLI Claude Code local** (`claude -p`) → réutilise ta session déjà connectée, **zéro clé**.
   Nécessite d'être **logué** au CLI (`claude` puis `/login`) sur la machine qui lance le serveur dev.
3. sinon **heuristique locale** (badge « estimated ») → le flux marche quand même.

Toute modif de `vite.config.ts`/`.env` nécessite un **redémarrage** du serveur dev.

> Windows : si `node` n'est pas dans le PATH du terminal, ouvre un nouveau terminal après
> l'install de Node, ou ajoute `C:\Program Files\nodejs` au PATH.

## Structure
```
src/
  types.ts                 modèle de données (Keyframe, Camera, Project…)
  store.ts                 store zustand — SOURCE DE VÉRITÉ unique (+ actions)
  lib/eval.ts              évaluation des clés à l'instant t, easing, look-at, spherical
  lib/presets.ts           presets trajectoire/courbe, interpolation A→B, match mouvement IA
  three/
    Scene.tsx              Canvas r3f, lumières, sol, DoF (mode Caméra), 2 caméras
    Product.tsx            useGLTF du packshot + normalisation/placement
    CameraController.tsx   pilote la caméra "render" depuis l'état ; orbit-compose (mode Caméra)
    SceneGizmos.tsx        vue Scène : frustum + spline 3D + poignées + gizmo PivotControls
    SplineOverlay.tsx      vue Caméra : spline en overlay SVG projeté
    shared.ts              pont r3f ↔ overlay DOM
  ui/                      Topbar, Toolbar, Inspector, Timeline, Generators, ViewPills, HUD, Modals, Toast
public/asset/              studio_packshot.gltf + .bin (45 Mo) + textures PBR
```

## Principes non négociables (respectés)
1. **Une seule timeline, la clé comme unité.** Tout générateur écrit des `Keyframe`.
2. Presets/IA produisent des **clés éditables** (jamais de boîte noire).
3. Raisonnement **par canal** : `position`, `rotation`, `focalLength`.
4. Un `target` actif possède le canal `rotation` (édition manuelle verrouillée).
5. Peu de clés lisibles.
6. Une vraie `PerspectiveCamera` **pilotée par l'état** (focale→fov, capteur 36 mm).

## Deux vues du viewport (façon Cinema 4D)
- **◉ Caméra** : à travers la caméra animée (rendu final + DoF/bokeh).
- **⬚ Scène** : caméra d'édition libre ; on voit le **frustum** de la caméra + la **spline
  d'animation en 3D** + poignées de clés. Gizmo **combiné** (translation + rotation) sur la
  caméra (drei `PivotControls`). Toggle repère **World / Objet** (raccourci `R`, défaut Objet).

## Raccourcis
`Espace` lecture/pause · `V/C/T` outils (Select/Caméra/Target) · `R` repère gizmo (World/Objet) ·
`Suppr` supprimer la clé sélectionnée.

## État & pistes (voir git log pour le détail)
Fait : socle scène + caméra, timeline/clés, spline éditable, presets, interpolation A→B,
target/look-at, IA mock (match caméra image + mouvement vidéo) + revue, export (WebM/PNG),
double vue + gizmo, **refonte UI Adobe Spectrum / Dimension** (branche `design`, polices Adobe
Clean, icônes Spectrum 2, grille infinie, vue Caméra en aperçu pur).
Pistes : cuts multi-caméras à l'export, exposer les 3 caméras du glTF comme poses de départ,
mode colorimétrie/post à part entière (l'ancien LUT a été retiré du scope caméra).

## Note de portabilité
Le projet est volontairement **hors OneDrive** (pour ne pas synchroniser `node_modules`).
Passer d'une machine à l'autre via **Git** : cloner + `npm install` + `npm run dev`.
L'asset produit et la police (© Adobe Inc.) sont **commités dans ce dépôt PRIVÉ** (choix assumé
pour que clone / StackBlitz / Codespaces marchent directement) — **à garder privé** (IP Adobe).
`scripts/fetch-asset.ps1` / `fetch-fonts.ps1` restent dispo en fallback (récup depuis OneDrive).
