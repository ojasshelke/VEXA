#!/bin/bash

echo "╔════════════════════════════════════════════╗"
echo "║         VEXA AI — Full Stack               ║"
echo "║  FASHN v1.5 (HF Space) + Next.js Frontend  ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Function to check if port is in use
port_in_use() {
  lsof -i :$1 > /dev/null 2>&1
}

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"


# ── 1. VEXA Python backend (port 8000) ────────────────────────────────────────
if port_in_use 8000; then
  echo "⚠️  Port 8000 in use — VEXA backend may already be running"
else
  echo "⚙️  Starting VEXA Backend (port 8000)..."
  osascript -e "tell app \"Terminal\" to do script \"cd $PROJECT_ROOT/backend && source .venv/bin/activate 2>/dev/null; pip install httpx -q 2>/dev/null; uvicorn main:app --host 0.0.0.0 --port 8000 --reload\"" 2>/dev/null || \
    (cd "$PROJECT_ROOT/backend" && uvicorn main:app --host 0.0.0.0 --port 8000 --reload &)
  sleep 2
fi

# ── 2. Next.js frontend (port 3000) ───────────────────────────────────────────
if port_in_use 3000; then
  echo "⚠️  Port 3000 in use — Next.js may already be running"
else
  echo "🌐 Starting Next.js Frontend (port 3000)..."
  osascript -e "tell app \"Terminal\" to do script \"cd $PROJECT_ROOT/frontend && npm run dev\"" 2>/dev/null || \
    (cd "$PROJECT_ROOT/frontend" && npm run dev &)
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Services starting in separate tabs         ║"
echo "║                                              ║"
echo "║  VEXA Backend:  http://localhost:8000        ║"
echo "║  VEXA App:      http://localhost:3000        ║"
echo "║  Try-On AI:     FASHN v1.5 (HuggingFace)    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Health checks:"
echo "  curl http://localhost:8000/health"
echo "  curl http://localhost:3000"
echo ""
echo "Note: Virtual try-on is powered by FASHN v1.5 on HuggingFace Spaces."
echo "      No local AI server needed — just HF_TOKEN in frontend/.env.local"
