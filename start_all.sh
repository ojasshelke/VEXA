#!/bin/bash

echo "╔════════════════════════════════════════════╗"
echo "║         VEXA AI — Full Stack               ║"
echo "║  M4 Pro Local AI + Next.js Frontend        ║"
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

# ── 2. CatVTON try-on server (port 8002) ─────────────────────────────────────
if port_in_use 8002; then
  echo "⚠️  Port 8002 in use — CatVTON server may already be running"
else
  echo "🧠 Starting CatVTON Try-On Server (port 8002)..."
  CATVTON_DIR="$PROJECT_ROOT/CatVTON"
  if [ ! -f "$CATVTON_DIR/model/pipeline.py" ]; then
    echo "   ⚠️  CatVTON repo not fully cloned at $CATVTON_DIR"
    echo "   Run: git clone https://github.com/Zheng-Chong/CatVTON $CATVTON_DIR"
    echo "   Skipping CatVTON startup."
  else
    # Use CatVTON's own venv (created during setup)
    if [ -f "$CATVTON_DIR/.venv/bin/activate" ]; then
      ACTIVATE="source $CATVTON_DIR/.venv/bin/activate"
    elif [ -f "$PROJECT_ROOT/backend/.venv/bin/activate" ]; then
      ACTIVATE="source $PROJECT_ROOT/backend/.venv/bin/activate"
    else
      ACTIVATE="echo 'Warning: no venv found — using system Python'"
    fi
    osascript -e "tell app \"Terminal\" to do script \"cd $CATVTON_DIR && $ACTIVATE && python vexa_tryon_server.py\"" 2>/dev/null || \
      (cd "$CATVTON_DIR" && .venv/bin/python vexa_tryon_server.py &)
  fi
fi

# ── 3. Next.js frontend (port 3000) ───────────────────────────────────────────
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
echo "║  CatVTON AI:    http://localhost:8002        ║"
echo "║  VEXA App:      http://localhost:3000        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Health checks:"
echo "  curl http://localhost:8000/health"
echo "  curl http://localhost:8002/health"
echo "  curl http://localhost:3000"
echo ""
echo "Note: CatVTON loads models on first start (~2-5 min)."
echo "      First-ever run downloads weights (~4GB) — offline after that."
