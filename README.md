# Mission Control

Dashboard local HTML/CSS/JS branché à des données réelles légères du vault + snapshots OpenClaw accessibles localement.

## Ce qui alimente le dashboard

Le script `refresh_data.py` reconstruit `app/data/*.json` à partir de sources locales lisibles:

- `EliasOS/02_PROJECTS.md`
- `EliasOS/06_CURRENT_FOCUS.md`
- `Memory/MEMORY.md`
- `Memory/memory/YYYY-MM-DD.md` (aujourd'hui + hier)
- `.openclaw/workspace-state.json`
- `Agent/Dr-Swanosten/.openclaw/workspace-state.json`
- `Projects/Mission Control/dashboard_blueprint_v1.md`

Quand une source n'existe pas ou ne contient pas l'info attendue, la donnée reste explicitement `unknown`, `missing` ou partielle.

## Rafraîchir les données

Depuis ce dossier:

```bash
cd "/Users/swanosten/Desktop/OBSIDIAN/swanosten/Projects/Mission Control/app"
python3 refresh_data.py
```

JSON générés:

- `data/dashboard.json`
- `data/projects.json`
- `data/tasks.json`
- `data/agents.json`
- `data/timeline.json`

## Lancer le dashboard

Servir localement est recommandé, car `fetch()` de JSON ne marche pas proprement en `file://`.

```bash
cd "/Users/swanosten/Desktop/OBSIDIAN/swanosten/Projects/Mission Control/app"
python3 -m http.server 8080
```

Puis ouvrir:

- `http://localhost:8080`

## Notes de structure

- `app.js` ne contient plus de mocks hardcodés: il charge `data/dashboard.json`
- `refresh_data.py` est la couche d'ingestion légère
- Pas de backend, pas de build step
- Le niveau de vérité dépend des fichiers locaux réellement présents

## Limites actuelles

- Les agents OpenClaw sont alimentés par snapshots locaux très simples, pas par une vraie API de sessions
- Les approvals sont inférées depuis les notes/projets/focus quand aucun inbox structuré n'existe localement
- La timeline dépend de ce qui est écrit dans les daily logs
