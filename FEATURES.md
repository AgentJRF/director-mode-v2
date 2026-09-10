# Director Mode — Récapitulatif des features

> Prototype web d'animation et de composition de caméra pour un logiciel 3D
> (concept **Adobe Dimension**). On place et anime des caméras autour d'un
> produit via plusieurs modes de création — manuel, presets, interpolation A→B, IA mockée —
> **tous convergeant vers une seule timeline de clés éditables.**

_Document généré le 2026-08-04. Reflète l'état du repo `AgentJRF/director-mode` (branche `main`)._

---

## 1. Concept & principes

- **Une seule timeline, la keyframe comme unité.** Tout mode de création (preset, interpolation, IA) écrit des `Keyframe` que l'utilisateur peut ensuite reprendre à la main. Jamais de boîte noire.
- **Raisonnement par canal** : `position`, `rotation`, `focalLength` (+ `poi`, `aperture`, `motionBlur`).
- **Vraie `PerspectiveCamera` pilotée par l'état** : focale → fov sur un capteur 36 mm.
- **Socle manuel entièrement éditable d'abord**, features assistées par-dessus (elles alimentent le store, ne le court-circuitent pas).

## 2. Stack technique

| Domaine | Techno |
|---|---|
| App | **React 19 + Vite + TypeScript** |
| 3D | **three.js** + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing` |
| État | **zustand** (store central unique = source de vérité) |
| Asset | glTF (sac « barrel bag ») chargé depuis `public/asset/` |
| Design | Adobe **Spectrum** dark + chrome façon **Adobe Dimension**, police **Adobe Clean**, icônes **Spectrum 2** |

## 3. Le viewport — 4 vues

- **◉ Caméra** — à travers la caméra animée : rendu final avec **profondeur de champ / bokeh** et **motion blur**. Aperçu pur (pas d'orbite/dolly qui polluerait le cadrage).
- **⬚ Scène** — caméra d'édition libre : on voit le **frustum** de la caméra + la **spline d'animation en 3D** + les **poignées de clés**. Gizmo combiné translation + rotation (drei `PivotControls`). Toggle repère **World / Objet** (`R`).
- **▥ Split** — Scène (gauche) + Caméra live (droite), avec **séparateur réglable** aligné sur le ratio du projet.
- **⊞ Quad** — Perspective + Top + Front + Side simultanés, gizmo caméra manipulable dans chaque vue.

## 4. Outils (toolbar)

| Outil | Raccourci | Rôle |
|---|---|---|
| **Select** | `V` | sélection / marquee des clés |
| **Camera / orbit** | `C` | composer le cadrage en orbitant |
| **Target** | `T` | définir la cible de visée (look-at) |
| **Pick focus point** | — | cliquer un point de la scène pour la mise au point |
| **Interpolate (A→B)** | — | cliquer caméra A puis B pour générer un mouvement |
| **Look through camera** | — | basculer dans la POV caméra |

## 5. Caméras & cible

- **Multi-caméras** : créer, supprimer n'importe quelle caméra (y compris la dernière → scène sans caméra), masquer/afficher, couleur d'identification visible.
- **Cible (target / POI)** : viser un **objet** (centre verrouillé) ou un **point** (POI animable). Quand une cible est active, le canal `rotation` est piloté par le look-at (édition manuelle verrouillée).
- **Outliner** : liste caméras + objets de la scène (Product, Pedestal).

## 6. Optique

- **Focale** (mm) → pilote le fov (capteur 36 mm).
- **Ouverture (f/)** → **profondeur de champ / bokeh** réel dans la vue Caméra.
- **Motion blur** (shutter) — obturateur configurable.
- **Focus** : mise au point générale (+ ouverture par défaut) ou **point de focus piqué** à la pipette.
- Chaque paramètre optique est **animable** (canal dédié).

## 7. Timeline & keyframes

- **Pose de clés** au playhead, par canal, avec dots ◆ indiquant l'état d'animation.
- **Lecture / pause** (`Espace`), scrub, **playhead au timecode**.
- **fps** configurable : 24 / 25 / 30 / 60.
- **Durée** réglable, affichée en **timecode unifié** (`H;MM;SS;FF`) cohérent avec le playhead.
- **Sélection multiple** de clés (marquee dans la vue Scène), déplacement groupé.
- **Suppression** de clé sélectionnée (`Suppr`).

## 8. Courbe de vitesse & poignées Bézier

- **Tracé spatial = courbe de Bézier 3D** avec **poignées de tangente** (`tangentIn`/`tangentOut`) draggables dans la vue Scène → contrôlent **la forme** du chemin.
- **Courbe de vitesse = ease** par segment : `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInOutStrong` (presets, appliqués à un segment ou à tout le move).
- **Séparation nette forme / vitesse** : la vitesse suit l'ease **quelle que soit la forme des poignées**, grâce au **reparamétrage par longueur d'arc** (`bezierArcParam`). Un ease `linear` = vitesse **constante** même sur un tracé courbe/en S.
- Défaut d'ease = **`linear`** (vitesse uniforme par défaut).
- Sélectionner la **1ʳᵉ** clé et changer l'ease agit sur son **segment sortant** (plus de no-op).

## 9. Visualisations du tracé

- **Height** — coloration jaune (bas) → rouge (haut), sur une plage absolue min pour ne pas « bruiter » un tracé plat.
- **Speed** — coloration blanc (lent) → bleu (rapide), révèle le rythme réel du mouvement.

## 10. Générateurs de mouvement (presets)

Chaque preset **écrit des clés éditables** (durée, amplitude, direction paramétrables) :

- **Orbit** (horaire / anti-horaire)
- **Arc**
- **Push in / Push out** (dolly avant/arrière)
- **Crane up / Crane down**
- **Pan / Tilt**
- **Dolly zoom** (effet Vertigo : dolly + focale compensée)

## 11. Interpolation A→B

- Cliquer **caméra A** puis **caméra B** → mouvement interpolé généré (position/rotation/focale) sur une courbe naturelle, en clés reprenables à la main.

## 12. IA (mockée / assistée)

- **✦ AI image** — uploader une photo (JPG/PNG) → l'IA estime **angle, focale, ouverture** pour composer le plan. Proxy local Vite `POST /api/match-camera`, en cascade : `ANTHROPIC_API_KEY` (API Claude vision) → **CLI Claude Code local** (zéro clé) → **heuristique locale** (badge « estimated »).
- **✦ AI video** — uploader une vidéo (MP4/WebM/MOV) → estimation du **mouvement caméra** de la réf, converti en clés. Démos « bakées » (poses exactes par nom de fichier) pour un déroulé fiable côté statique.
- Principe : un générateur IA **alimente le store** (clés + tangentes éditables), jamais un rendu opaque.

## 13. Montage / multicam

- **Cuts multi-caméras WYSIWYG** : le scrub et le split suivent le **programme** (la caméra à l'antenne).
- **Fenêtre on-air** par caméra (poignées de trim sur la barre de clip).
- **Outils de montage** : déplacer / dupliquer des plans, durée au timecode.

## 14. Historique & raccourcis

- **Undo / Redo** — `Ctrl+Z` / `Ctrl+Y` (+ icônes annuler/rétablir dans la Topbar).
- Raccourcis : `Espace` play/pause · `V`/`C`/`T` outils · `R` repère gizmo (World/Objet) · `Suppr` supprimer la clé.

## 15. Export

- **Image fixe** — PNG (`director-shot.png`) via `canvas.toDataURL`.
- **Vidéo** — WebM (VP9) via `MediaRecorder` : rendu de l'animation caméra à l'écran.

> ⚠️ Pour une démo, lancer `npm run dev` (les endpoints IA vivent dans le serveur de dev Vite, pas dans un build statique).

## 16. Architecture (repères code)

```
src/
  types.ts              modèle de données (Keyframe, Camera, Project…)
  store.ts              store zustand — SOURCE DE VÉRITÉ unique (+ actions)
  lib/eval.ts           évaluation à l'instant t : easing, Bézier + reparam arc-length, look-at, spherical
  lib/presets.ts        presets trajectoire/courbe, interpolation A→B, match mouvement IA
  lib/aiMatch.ts        parsing / heuristique du match caméra
  three/
    Scene.tsx           Canvas r3f, lumières, sol, DoF (mode Caméra)
    Product.tsx         useGLTF du packshot + normalisation/placement
    CameraController.tsx caméra "render" pilotée par l'état ; orbit-compose
    SceneGizmos.tsx     vue Scène : frustum + spline 3D + poignées + PivotControls + viz Height/Speed
    SplineOverlay.tsx   vue Caméra : repère de visée en overlay SVG projeté
    multiview/          rendu et gizmos de la vue Quad
  ui/                   Topbar, Toolbar, Inspector, Timeline, ViewPills, HUD, Modals, Toast, Outliner
public/asset/           studio_packshot.gltf + .bin (~43 Mo) + textures PBR + fonts Adobe Clean
```

## 17. Pistes / roadmap

- Contrôle de vitesse directement sur le **graphe d'ease** (poignées éditables sur la courbe de vitesse, pas seulement des presets).
- Exposer les **3 caméras du glTF** comme poses de départ.
- **Cuts multi-caméras à l'export** (montage rendu).
- **Mode colorimétrie / post** à part entière (l'ancien LUT a été retiré du scope caméra).

---

_Pour les procédures d'accès / démo (local, Codespaces, StackBlitz, dépannage) : voir `ACCESS.md`. Pour le quickstart : `README.md`._
