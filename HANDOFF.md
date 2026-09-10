# Director Mode v2 — Intégration Lighting · HANDOFF

> Document de reprise. À lire en premier (par un humain **ou** par Claude Code) pour comprendre
> le projet, ce qui est **déjà fait**, et ce qui **reste à faire**.

---

## 1. Le projet en une phrase

On fusionne deux prototypes maison en un seul : **Director Mode** (app d'animation de caméra,
React + react-three-fiber + zustand, concept Adobe Dimension) devient l'hôte, et on y intègre les
**features de lighting** d'un ancien prototype (« auto lighting », un mockup Substance 3D Stager en
HTML/JS vanilla). Objectif : mêmes features que les deux protos réunis, à la qualité du Director Mode.

## 2. Décisions d'architecture (déjà actées)

- **Les lumières deviennent des entités de premier rang dans le store zustand**, sœurs des caméras
  (`Project.lights: Light[]`, `Project.activeLightId`). Avant, l'éclairage était un rig codé en dur
  dans `Scene.tsx` (mobilier de viewport). Maintenant c'est de la **donnée éditable**.
- **Un spot/directional vise comme une caméra avec un POI** → réutilise le type `Target` et le look-at
  existants (`eulerFromLookAt`, `poiPoint`).
- **Canaux animables : `position`, `poi`, `intensity`** (réutilisent `Keyframe` ; `intensity` a été
  ajouté à l'union `Channel`). Couleur / angle / penumbra = **statiques par lumière** (comme l'optique
  caméra). → Les lumières vivent sur **la même timeline** que les caméras et héritent de l'undo/redo.
- **La logique lumière vit surtout dans des modules `lib/` externes** qui écrivent dans le store via
  `S()` + `bump()` (même pattern que `lib/presets.ts`), pour minimiser les changements au store.
- **Le rig par défaut (6 lumières) est un portage 1:1 du rig codé en dur**, donc le rendu par défaut
  est identique — zéro régression visuelle.

## 3. ÉTAT ACTUEL — ce qui est FAIT ✅

Les **8 nouveaux fichiers** de la Partie 1 sont créés et **compilent (0 erreur TypeScript)** :

- `src/types.ts` (REMPLACÉ — ajout de `Light`, `LightKind`, `LightGobo`, `Project.lights`,
  `Project.activeLightId`, `'intensity'` dans `Channel`, `'light'` dans `Tool`, `'aiLight'` dans `KeySource`)
- `src/store.ts` (MODIFIÉ — 5 insertions : import `makeDefaultLights`, `lights`/`activeLightId` dans
  le projet initial, `inspect: 'camera' | 'light'` dans `UI` + son init, `ui.inspect='camera'` dans `selectCamera`)
- `src/lib/lightRig.ts` (NOUVEAU — `makeLight`, `makeDefaultLights`, `lightHideKey`)
- `src/lib/lightEval.ts` (NOUVEAU — `evalLight`, `lightPoi`, éval par canal avec Bézier arc-length)
- `src/lib/lights.ts` (NOUVEAU — CRUD, sélection, setters, éditeurs keyframe-aware, helpers timeline)
- `src/three/SceneLights.tsx` (NOUVEAU — rend `project.lights` en lumières r3f, animées via `useFrame`)
- `src/three/LightGizmos.tsx` (NOUVEAU — PivotControls déplacer + crosshair POI viser)
- `src/three/LightMarkers.tsx` (NOUVEAU — pastilles cliquables pour sélectionner une lumière)
- `src/ui/LightInspector.tsx` (NOUVEAU — panneau de réglages de la lumière sélectionnée)

> ⚠️ IMPORTANT pour Claude Code : **NE PAS recréer ces 8 fichiers ni re-modifier `store.ts`.** C'est fait.

## 4. ÉTAT ACTUEL — ce qui RESTE À FAIRE ⬜ (les « branchements »)

Il reste **uniquement** les modifications de la **Partie 2 de `LIGHTING-SETUP.md`** dans des fichiers
existants. Le code exact de chaque insertion est dans ce guide. Fichiers concernés :

1. `src/three/Product.tsx` — changer l'URL de l'asset en `'/asset/Outdoor_Bag_Blue_orange_V03.glb'`.
2. `src/three/Scene.tsx` — supprimer la fonction `Lights()` codée en dur ; importer et rendre
   `<SceneLights />`, `<LightMarkers />`, `<LightGizmos />`.
3. `src/ui/Inspector.tsx` — importer `LightInspector` + `activeLight`, et brancher :
   quand `ui.inspect === 'light'` et qu'une lumière est active → afficher `<LightInspector />`,
   sinon le panneau caméra existant.
4. `src/ui/Outliner.tsx` — ajouter une section « Lights » (liste + sélection + œil + suppr + « New light »).
5. `src/ui/Toolbar.tsx` — ajouter un bouton d'outil `light`.
6. `src/ui/Timeline.tsx` — 8 insertions additives pour la piste timeline des lumières
   (attributs `data-lkey`, mode de drag `'lkey'` — n'affecte pas le chemin caméra).

**Asset** : déposer le `.glb` optimisé du sac (nom exact `Outdoor_Bag_Blue_orange_V03.glb`, ~61 Mo, 1K)
dans `public/asset/`.

## 5. Prompt à donner à Claude Code

> J'intègre un système de lumières dans ce projet (Director Mode : React 19 + @react-three/fiber v9 +
> @react-three/drei v10 + zustand v5 + three 0.185 + Vite). Le plan complet et tout le code sont dans
> `LIGHTING-SETUP.md` à la racine. La **Partie 1 est déjà faite** : les 8 nouveaux fichiers existent et
> `store.ts` est déjà modifié — ne les recrée pas, ne retouche pas `store.ts`. Applique **uniquement la
> Partie 2** (les « branchements ») dans : Product.tsx, Scene.tsx, Inspector.tsx, Outliner.tsx,
> Toolbar.tsx, Timeline.tsx, en suivant exactement le guide. Attention aux edits « au milieu » de
> fichiers existants (Inspector, Timeline) : lis d'abord le fichier réel pour placer l'insertion au bon
> endroit. Ensuite lance `npm run dev` et corrige les erreurs éventuelles. Ne casse pas le chemin caméra.

## 6. Test de validation (quand les branchements sont faits)

`npm run dev` → l'app charge le sac, l'éclairage est identique à avant, et le panneau de droite a une
section **Lights** (6 lumières). Cliquer une lumière → l'Inspector montre ses réglages ; en vue Scene
un gizmo apparaît (déplacer + viser) ; ses keyframes s'affichent dans la timeline.

## 7. Suite du projet (après les branchements) — roadmap

- **Étape 4 — Templates d'éclairage + IBL** : presets three-point / gobo (façon `lib/presets.ts`) +
  environment map (`scene.environment`). C'est là qu'on rapatrie le gros de la valeur de l'auto lighting.
- **Étape 5 — Smart Lighting IA** : un modal calqué sur `AIImageModal` + un endpoint dev
  `/api/match-lighting` dans `vite.config.ts` (calqué sur `/api/match-camera`), qui renvoie un JSON
  `{ summary, lights[] }` (prompt Claude vision hérité de l'auto lighting) → `applyAILights()` écrit des
  `Light[]` éditables (jamais de boîte noire, conforme aux principes du Director Mode).
- Améliorations déjà prévues : lumières animables sur la timeline (fait), gizmos unifiés (fait),
  presets lumière dans l'undo (acquis via le store). Restent : multi-sélection au lasso des clés de
  lumière dans la timeline (volontairement omise en v1), couleur animable (canal RGB), gobo complet.

## 8. Notes / pièges connus

- **Casse des noms de fichiers** (Windows) : `lightRig.ts` en minuscule (un souci de casse a coûté du
  temps pendant le montage manuel). Vérifier que les imports correspondent exactement.
- **OneDrive** : le projet est dans un dossier OneDrive — possibles lenteurs/verrous de synchro.
- **Multiview / Quad** : les gizmos lumière sont masqués en multiview (comme le gizmo caméra ;
  `PivotControls` ne suit que la caméra par défaut).
- **three 0.185** = éclairage physique par défaut : les intensités du rig sont déjà calibrées pour cette
  version (portées telles quelles depuis l'ancien `Scene.tsx`).
