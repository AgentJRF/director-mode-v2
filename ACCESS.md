# Accéder au proto « Director mode » — procédures de démo

Repo : `git@github.com:AgentJRF/director-mode.git` (privé) · branche par défaut : **`main`**
Tout est à jour sur `main` (asset produit + police Adobe Clean **inclus dans le repo**, IA mockée sans clé).

**🔗 Lien de démo à partager (rien à installer)** : https://director-mode.vercel.app/ — hébergé sur Vercel, mis à jour à chaque `git push` (IA de démo bakée côté client).

> ⚠️ **Toujours lancer avec `npm run dev`** (pas `npm run build` / `preview`) : les fonctions **IA**
> (match caméra image/vidéo) sont des endpoints du **serveur de dev** Vite — elles n'existent pas
> dans un build statique.

---

## 1. En local (recommandé pour TES démos — le plus fiable, hors-ligne)

Prérequis : **Node.js 20+** (déjà installé sur ta machine).

- **Le plus simple (Windows)** : dans `D:\OneDrive - Adobe\Desktop\Claude\director-mode`, double-clique **`start-dev.cmd`**
  (il ajoute Node au PATH et lance le serveur).
- **Ou en terminal** :
  ```bash
  npm run dev
  ```
- Ouvre **http://localhost:5173** dans Chrome.

> Si le lancement échoue avec une erreur de **port 5173 déjà utilisé** : ferme la session Claude / le
> preview de Claude (il occupe ce port), puis relance.

---

## 2. GitHub Codespaces (démo/test sans rien installer, dans le navigateur)

1. Page du repo → **`Code ▸ Codespaces ▸ Create codespace on main`**.
2. GitHub construit le conteneur, fait `npm install`, puis lance **automatiquement** `npm run dev`.
3. Le port **5173** est publié et l'aperçu **s'ouvre tout seul** → l'app complète (IA comprise) tourne.

Rien à configurer : le `.devcontainer` s'en charge. (Codespaces gratuit jusqu'à un quota mensuel généreux.)

---

## 3. StackBlitz (lien rapide à partager)

Ouvre :
```
https://stackblitz.com/github/AgentJRF/director-mode
```
Ça clone le repo et lance `npm run dev` **dans le navigateur**. Idéal pour envoyer un lien.

---

## 4. Cloner + lancer sur une autre machine

```bash
git clone git@github.com:AgentJRF/director-mode.git
cd director-mode
npm install
npm run dev        # http://localhost:5173
```
(Plus besoin de récupérer l'asset : il est dans le repo.)

---

## Donner l'accès à des collègues (repo privé)

Les 3 méthodes ci-dessus nécessitent un **accès au repo privé** :

1. GitHub → repo `director-mode` → **Settings ▸ Collaborators ▸ Add people**.
2. Ajoute le **compte GitHub** du collègue (rôle *Read* suffit pour tester).
3. Il accepte l'invitation, puis peut : ouvrir le lien StackBlitz / créer un Codespace / cloner.

---

## Dépannage rapide

| Symptôme | Cause / solution |
|---|---|
| « Port 5173 already in use » | Le preview de Claude tourne — ferme-le, puis relance `npm run dev`. |
| `node` introuvable dans le terminal | Utilise `start-dev.cmd`, ou ajoute `C:\Program Files\nodejs` au PATH. |
| Le sac ne s'affiche pas au 1er chargement | Le glTF (~45 Mo) finit de charger — patiente / recharge la page. |
| L'IA « Analyze » ne répond pas | Tu es en build statique. Relance en **`npm run dev`**. |
| Ancienne interface (sombre, ambre) | Tu n'es pas sur `main` : `git switch main`. |

---

## Ce que montre le proto

- **4 vues** : ◉ Caméra (rendu final + bokeh, **aperçu pur**) · ⬚ Scène (édition libre, gizmo, grille infinie) · ▥ Split (Scène + Caméra) · ⊞ Quad (Persp / Top / Front / Side).
- **Créer un mouvement** : manuel, presets (orbit / arc / push / crane / dolly zoom…), interpolation A→B, ou **IA** (match caméra depuis une image, match mouvement depuis une vidéo — mockés, sans clé).
- **Timeline** unique de clés éditables · **Export** WebM / PNG (MP4 / ProRes visés en version finale).
- UI alignée **Adobe Spectrum / Adobe Dimension** (police Adobe Clean, icônes Spectrum 2).
