# notepadd

A local-first Obsidian-like markdown web app with wiki-links, backlinks, tags, a graph view, and git sync (push/pull) to a configured remote.

## Features

- Markdown editor + live preview (split / editor-only / preview-only)
- File tree sidebar with folders, rename, delete
- `[[Wiki-links]]` + backlinks panel
- `#tags` panel
- Force-directed graph view (`Ctrl/Cmd+G`)
- Full-text search palette (`Ctrl/Cmd+K`)
- Auto filename-from-H1 with filesystem-safe validation
- Code block + table insertion toolbar
- Git sync: configure remote in `.env` (server-side), push to upload notes, pull to fetch
- Auto-sync (pull + push only-if-changed every minute; skips notes you've edited since last sync)

## Run in development

```bash
npm install
npm run dev:all   # backend (tsx watch) + frontend (vite) together
# or separately:
npm run server    # Express API on :3001
npm run dev       # Vite dev server on :5173 (proxies /api → :3001)
```

## Production (single container)

The Dockerfile is a multi-stage build:

1. **builder** — installs all deps, runs `tsc -b && vite build` to produce `dist/`
2. **runtime** — `node:24-bookworm-slim` + `git`, production deps only, serves `dist/` and `/api/*` from a single Express server on port 3001

### Build & publish to Docker Hub

```bash
docker build -t v10o/notepadd:latest .
docker tag v10o/notepadd:latest v10o/notepadd:v0.1
docker push v10o/notepadd:latest
docker push v10o/notepadd:v0.1
```

### Run with docker compose

`compose.yml` mounts `./.env` into the container and persists the cloned git repo in a named volume:

```bash
# Create .env at the project root (gitignored) with your git config:
#   GIT_REMOTE_URL=https://github.com/you/your-vault.git
#   GIT_BRANCH=main
#   GIT_AUTHOR_NAME=Your Name
#   GIT_AUTHOR_EMAIL=you@example.com
#   GIT_TOKEN=ghp_xxx
docker compose up -d
# App at http://localhost:3001
```

### Run the image directly

```bash
docker run -d --name notepadd \
  -p 3001:3001 \
  -v notepadd-repo:/app/.notepadd-repo \
  -v "$PWD/.env:/app/.env:ro" \
  v10o/notepadd:latest
```

## Configuration (`.env`)

Git config is stored server-side in `.env` (never in the browser). The in-app **Setup Git** modal reads/writes it via `/api/git/config`.

| Key | Required | Description |
| --- | --- | --- |
| `GIT_REMOTE_URL` | yes | HTTPS URL of the remote repo (e.g. `https://github.com/owner/repo.git`) |
| `GIT_BRANCH` | yes | Branch to push/pull (e.g. `main`) |
| `GIT_AUTHOR_NAME` | no | Commit author name (default `notepadd`) |
| `GIT_AUTHOR_EMAIL` | no | Commit author email (default `notepadd@local`) |
| `GIT_TOKEN` | no | Personal access token for HTTPS push auth |
| `PORT` | no | Server port (default `3001`) |

## Tech stack

- React 19 + TypeScript + Vite + Tailwind v4
- CodeMirror (markdown editor), react-markdown + remark-gfm + rehype-highlight (preview)
- d3-force (graph view), Dexie (IndexedDB vault cache when not using FSA API)
- Express + simple-git (server-side git sync), tsx (TS runtime)