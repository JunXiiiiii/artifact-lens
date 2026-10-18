# Artifact Lens — FLL UNEARTHED Season

Help archaeologists identify physical artifacts using a laptop camera. Scan an object,
estimate its age, find a real-world match, assess condition and origin, and generate a
field summary. Everything is stored in PostgreSQL, permanently attributed to the
account that made the scan.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Ollama installed and running locally with the Qwen2.5-VL model pulled

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET, OWNER_EMAIL
createdb artifactlens   # or create the DB your DATABASE_URL points to
npm run db:init
ollama pull qwen2.5vl:3b
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Archive viewer: http://localhost:8181 (after starting it)

## How to pull the Ollama model

```bash
ollama pull qwen2.5vl:3b
```

Make sure the Ollama server is running (`ollama serve`) before scanning. The status
panel in the app shows AI: Online/Offline.

## How to open the database viewer

Click **Open Archive** in the app's status panel (bottom-right). This starts the
standalone viewer server on `localhost:8181` and opens it in a new tab. Paste your
JWT from the main app when prompted (or use the `?token=` URL param which the app
appends automatically).

## Account setup

The first account registered with the email matching `OWNER_EMAIL` in `.env`
automatically becomes the **owner**. All other accounts are **consumers**:

- Consumers see, edit, and delete only their own scans.
- Owners see every account's scans, can delete anything, and can use bulk delete.

## Project structure

```
artifact-lens/
├── server/      # Express API on :3000 (auth, scans, accounts, status, AI pipeline)
├── viewer/      # Standalone read-heavy server on :8181 + self-contained index.html
└── client/      # React + Vite frontend on :5173
```

## Notes

- Each scan stores a small JPEG thumbnail (max 480px) of the captured frame alongside
  the identification. Full-resolution frames are sent to the AI but never stored.
- Generated 3D models are stored as GLB files under `storage/models/{scanId}.glb`;
  the database keeps only the path. `storage/models/sample.glb` is a tiny procedural
  test model (regenerate with `node server/scripts/makeSampleGlb.js`).


## Performance (16GB Macs)

The app is tuned to stay light when everything runs together:


- The AI uses `qwen2.5vl:3b` with a capped 2048-token context and short response
  limit (see `server/services/aiService.js`) — ~10s per identification instead of
  ~50s+, and ~4GB resident instead of much more.
- Live tracking re-classifies at most every 10s (one tile at a time) and pauses
  when the tab is hidden.
- The model unloads after 5 minutes idle, freeing its RAM automatically.
- Daily driver: `npm run dev`. Low-RAM mode: `npm run serve` (production build +
  static preview instead of the Vite dev server).


Typical footprint: AI ~4GB + macOS ~4GB + browser ~1.5GB + Postgres/Node ~0.5GB —
comfortable on 16GB. Keep the unused `qwen2.5vl:7b` unloaded (nothing references
it) and prefer Safari/Chrome with few tabs while scanning.


## 3D Engine (Hunyuan3D-2, optional)


3D model generation is an optional enhancement — identification, history, and the
Library work fully without it. The status bar shows **3D Engine Offline** until a
Hunyuan3D service is reachable.


**Hardware note:** Hunyuan3D-2 needs a CUDA GPU with 12GB+ VRAM. It will not run on
a MacBook — use the compose sidecar on a GPU host, or the free Colab path below.


1. On the GPU machine, install Hunyuan3D-2 (https://github.com/Tencent/Hunyuan3D-2)
   and start an HTTP wrapper exposing:
   - `GET /health` → 200 when ready
   - `POST /generate` with `{ images: [{ angle, image }] }` (base64) returning the
     GLB binary (`Content-Type: model/gltf-binary`) or `{ glb_base64: "..." }`
2. Set `HUNYUAN_BASE_URL=http://gpu-machine:8080` in `.env` (or serve from a port
   forward to `localhost:8080`).
3. Optionally set `HUNYUAN_CMD` to a launch command so `POST /api/3d/start`
   (status bar → 3D Engine → Start) can boot it as a child process.


Flow: open a scan's Library profile (or Record Card) → **Generate 3D Model** →
capture one photo → Generate. The GLB is saved, viewable
in the Library's Three.js showcase with orbit/zoom, and downloadable.


## Autonomous stack (no manual starts)


`docker-compose.yml` boots Postgres + the Hunyuan3D sidecar + the API together —
the engine starts with the stack, so 3D Engine reads Online with zero clicks:


```bash
# one-time: set secrets (JWT_SECRET, OWNER_EMAIL, DB_PASSWORD) in .env
docker compose up --build -d
```


- The `hunyuan` sidecar builds from `services/hunyuan/Dockerfile` and serves the
  repo-owned `server/hunyuan_server.py` — the exact same file the Colab setup
  uses, so cloud, Colab, and local behavior are identical.
- Model weights cache in the `hfcache` volume: first generation downloads
  (~2–4GB), later ones start fast.
- `restart: unless-stopped` on every service: a rebooted host comes back with
  everything Online and no human steps.
- No GPU on the host? Delete the `deploy:` GPU block from the `hunyuan`
  service — the engine reports Offline and everything else works.
- The API's `HUNYUAN_BASE_URL` is fixed to `http://hunyuan:8080` inside the
  stack, so rotating tunnel URLs and stale `.env` values stop being a failure
  mode. `POST /api/3d/start` is a harmless no-op when the sidecar is up.


Colab + ngrok still works as the free path: set `HUNYUAN_BASE_URL` to the tunnel
URL. Prefer a reserved (static) ngrok domain so restarts don't invalidate `.env`.
- Status and tracking use polling (no WebSockets).
- The UI is desktop-only and always dark (Expedition Badge tokens).


## Hosting on Vercel (frontend) + a backend host


Vercel hosts static frontends — it cannot run this backend (persistent Express
process), Postgres, Ollama, the `:8181` viewer, or GLB file storage. Split the
deploy:


**1. Backend → Railway / Render / Fly.io (Docker)**
- This repo includes a `Dockerfile` for the API. Deploy it with these env vars:
  `DATABASE_URL` (use Neon or Supabase Postgres), `JWT_SECRET`, `JWT_EXPIRY`,
  `OWNER_EMAIL`, `OLLAMA_BASE_URL` (your Ollama endpoint, e.g. an Ollama Cloud
  URL or a GPU box), `HUNYUAN_BASE_URL` (optional), `NODE_ENV=production`.
- Run schema init once against the hosted DB: `npm run db:init` with the
  production `DATABASE_URL` (or let the server self-init on first boot — it
  creates tables automatically).
- GLB models are written to `storage/models/` — on hosts with ephemeral disks,
  mount a persistent volume at `/app/storage` or they vanish on redeploy.
- Hunyuan setup is identical when hosted: it is only ever a URL
  (`HUNYUAN_BASE_URL`), so Vercel changes nothing — point it at the compose
  sidecar, a GPU box, or a reserved-domain ngrok tunnel and never touch it again.
- One generation holds a single HTTP request open for up to 10 minutes. Hosts
  that kill requests early (some free tiers cap at 60–100s) will abort builds —
  prefer Railway / Fly.io, or the full `docker compose` stack where you control
  timeouts.


**2. Frontend → Vercel**
- Import the repo, set **Root Directory = `client`**, Framework = Vite.
  (`client/package.json` exists for exactly this.)
- Set env var `VITE_API_URL=https://your-api-host` (no trailing slash).
  The app prefixes every API call with it; leave it unset for local dev
  (Vite proxies `/api` → `localhost:3000`).
- Camera works on Vercel because it serves HTTPS (browsers gate cameras to
  secure contexts).


**What changes when hosted:** the `:8181` Archive Viewer and one-click viewer
start are local-dev features (a cloud backend can't open ports on your laptop) —
query the hosted Postgres directly instead (Neon/Supabase dashboards). AI and
3D generation work as long as `OLLAMA_BASE_URL` / `HUNYUAN_BASE_URL` point at
reachable services.


## VSCode setup


Open the repo folder in VSCode — `.vscode/` is included:


- **Run & Debug** (`⇧⌘D`): `Debug: Full stack`, `Debug: API server` (with
  breakpoints, loads `.env`), `Debug: Frontend (Chrome)`.
- **Tasks** (`⇧⌘B` / Terminal → Run Task): full-stack dev, frontend-only dev,
  frontend build, `db:init`.
- Suggested extensions install prompt on first open (Tailwind, rename-tag,
  path-intellisense). Tab size 2, LF endings configured.
