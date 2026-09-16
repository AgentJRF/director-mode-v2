# Director Mode v2 — Checklist de review

> Refresh dur avant de commencer : **Ctrl+Shift+R**. Coche au fur et à mesure et note tout ce qui cloche.

## 1. Match caméra (image → pose)
- [ ] ✦ AI → **Camera → From image** → upload une réf backpack (nom contenant `backpack`/`lowepro`/`protactic`) → **Analyze** → **Apply pose**.
- [ ] La pose tombe sur la **vue arrière 3/4** du backpack (≈ 50 mm, f/8).
- [ ] Les champs (azimut/élévation/distance/focal/ouverture) sont **éditables** et le preview réagit.

## 2. Prompt → caméra (offline)
- [ ] ✦ AI → **Camera → From a prompt**.
- [ ] « low three-quarter from the left, 85mm, shallow depth » → angle bas 3/4 gauche, 85 mm, faible profondeur.
- [ ] « top-down packshot » → vue plongeante.
- [ ] « wide establishing shot, deep focus » → recul large + f élevé.
- [ ] Les chips pré-remplissent le prompt. **Apply pose** compose sans créer de keyframes.

## 3. Lighting IA (référence → rig)
- [ ] ✦ AI → **Lighting → Match reference** → upload la réf backpack contre-jour → **Analyze**.
- [ ] **Side-by-side** : Reference | Result (viewport) + jauge **Match**.
- [ ] Le rig est un **contre-jour golden hour** (rim chaud gauche, face relevée). **Keep** applique, **Back** annule.

## 4. Prompt → lighting (offline, avec modificateurs)
- [ ] ✦ AI → **Lighting → From a prompt**.
- [ ] « dramatic side light, deep shadows » → Dramatic.
- [ ] « dramatic but cooler and softer » → Dramatic teinté froid + edges adoucis.
- [ ] « clean studio, brighter » → Softbox plus lumineux.
- [ ] « golden hour, subtle » → contre-jour chaud, key atténuée.
- [ ] Le reasoning liste les ajustements détectés. Rig **éditable** après coup.

## 5. Env light IA
- [ ] ✦ AI → **Env light** → upload une **photo produit** (nom `backpack`/`mountain`/`sunset`…) → badge **AI** + bouton **Generate environment**.
- [ ] **Side-by-side** Reference | Result ; reflets/ambient chauds sur le backpack. **Keep**/**Back** OK.
- [ ] Upload direct d'une **pano équirect** (large) → utilisée telle quelle (**Build environment**).

## 6. Presets lighting → ajout en groupe
- [ ] Place une light à la main, puis applique un preset (ex. Softbox) → **ta light reste**.
- [ ] Les lights du preset apparaissent dans un **groupe nommé** dans l'outliner (Softbox…).
- [ ] Réappliquer le même preset → suffixe unique (Softbox 2).
- [ ] En-tête de groupe **repliable** + **corbeille** supprime tout le groupe.
- [ ] (À valider) le preset applique aussi ses réglages d'**Env** — dis si tu préfères que l'ajout n'y touche pas.

## 7. Area light
- [ ] Sélectionne une area light, change **Width/Height** → le **wireframe** (rectangle) suit.
- [ ] L'ombre projetée reste **propre** (plus de traînées bizarres) ; note si un placement précis casse encore l'ombre.

## 8. Timeline
- [ ] Sélectionne une **light**, puis **clique la piste caméra** → l'inspecteur **caméra** revient.
- [ ] Déplacement/keyframes caméra + light OK.

## 9. Splitters / UI
- [ ] Passe la souris sur les bords (inspector / timeline / split) → **plus de clignotement jaune**.
- [ ] Bouton **✦ AI** bien visible (dégradé violet) ; hub à onglets Camera / Lighting.

---
### Notes de review (à remplir)
-
-
-
