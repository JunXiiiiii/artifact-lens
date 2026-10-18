#!/usr/bin/env zsh
# Artifact Lens — One-Command Startup (< 60 seconds)
# Usage: ./start.sh

set -e

REPO_ROOT="${0:A:h}"
cd "$REPO_ROOT"

echo "🚀 Artifact Lens — Starting in < 60s..."

# 1. Check prerequisites
command -v docker >/dev/null || { echo "❌ Docker not installed"; exit 1 }
command -v node >/dev/null || { echo "❌ Node.js not installed"; exit 1 }
command -v npm >/dev/null || { echo "❌ npm not installed"; exit 1 }

# 2. Check .env exists
if [[ ! -f .env ]]; then
  echo "⚠️  .env not found — copying from .env.example"
  cp .env.example .env
  echo "⚠️  Edit .env with your credentials (JWT_SECRET, OWNER_EMAIL, etc.)"
  echo "   Then re-run this script."
  exit 1
fi

# 3. Start database + services (background)
echo "📦 Starting database + services..."
docker compose up --build -d db

# Wait for DB health
echo "⏳ Waiting for database..."
for i in {1..30}; do
  if docker compose exec -T db pg_isready -U artifact -d artifactlens >/dev/null 2>&1; then
    echo "✅ Database ready"
    break
  fi
  sleep 1
done

# 4. Run migrations (idempotent)
echo "🗄️  Running migrations..."
npm run db:init --silent 2>/dev/null || true

# 4b. Start API + Hunyuan (if GPU available)
echo "🚀 Starting API + 3D engine..."
docker compose up -d api hunyuan 2>/dev/null || docker compose up -d api

# 5. Wait for API health
echo "⏳ Waiting for API..."
for i in {1..30}; do
  if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
    echo "✅ API ready"
    break
  fi
  sleep 1
done

# 5b. Start frontend dev server in background
echo "🌐 Starting frontend..."
npm run client --silent >/dev/null 2>&1 &
FRONTEND_PID=$!

# 6. Wait for frontend
echo "⏳ Waiting for frontend..."
for i in {1..15}; do
  if curl -sf http://localhost:5173 >/dev/null 2>&1; then
    echo "✅ Frontend ready"
    break
  fi
  sleep 1
done

# 6b. Start Ollama if not running
if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "🤖 Starting Ollama..."
  ollama serve >/dev/null 2>&1 &
  sleep 3
fi

# 7. Warm up AI (run in background)
npm run demo:prepare >/dev/null 2>&1 &

# 7. Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Artifact Lens is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Frontend:    http://localhost:5173"
echo "🔧 API:         http://localhost:3000"
echo "🗄️  Database:   postgresql://artifact@localhost:5432/artifactlens"
echo "🤖 Ollama:      http://localhost:11434 (qwen2.5vl:3b)"
echo "🤖 3D Engine:   http://localhost:8081 (hunyuan)"
echo "📊 Viewer:      http://localhost:8181"
echo ""
echo "🎯 Demo:        npm run demo:prepare  (run 5 min before show)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop all services"

# Keep script alive, forward signals
trap "echo 'Stopping...'; docker compose down; kill $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait