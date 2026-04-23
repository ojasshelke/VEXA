#!/bin/bash

echo "╔════════════════════════════════════════╗"
echo "║         VEXA AI — Full Stack           ║"
echo "║  M4 Pro Local AI + Next.js Frontend    ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Function to check if port is in use
port_in_use() {
  lsof -i :$1 > /dev/null 2>&1
}

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
IDOL_DIR="$HOME/Documents/IDOL"
VTON_DIR="$HOME/Documents/IDM-VTON"

# Start IDOL (3D Avatar) on port 8001
if port_in_use 8001; then
  echo "⚠️  Port 8001 in use — IDOL server may already be running"
else
  echo "🎭 Starting IDOL Avatar Service (port 8001)..."
  osascript -e "tell app \"Terminal\" to do script \"cd $IDOL_DIR && source .venv/bin/activate && uvicorn vexa_idol_server:app --host 0.0.0.0 --port 8001\"" 2>/dev/null || \
    (cd "$IDOL_DIR" && source .venv/bin/activate && uvicorn vexa_idol_server:app --host 0.0.0.0 --port 8001 &)
  sleep 2
fi

# Start IDM-VTON (Try-On) on port 8002
if port_in_use 8002; then
  echo "⚠️  Port 8002 in use — IDM-VTON server may already be running"
else
  echo "👗 Starting IDM-VTON Try-On Service (port 8002)..."
  osascript -e "tell app \"Terminal\" to do script \"cd $VTON_DIR && source .venv/bin/activate && uvicorn vexa_tryon_server:app --host 0.0.0.0 --port 8002\"" 2>/dev/null || \
    (cd "$VTON_DIR" && source .venv/bin/activate && uvicorn vexa_tryon_server:app --host 0.0.0.0 --port 8002 &)
  sleep 2
fi

# Start VEXA Python backend on port 8000
if port_in_use 8000; then
  echo "⚠️  Port 8000 in use — VEXA backend may already be running"
else
  echo "⚙️  Starting VEXA Backend (port 8000)..."
  osascript -e "tell app \"Terminal\" to do script \"cd $PROJECT_ROOT/backend && source .venv/bin/activate 2>/dev/null; pip install httpx -q 2>/dev/null; uvicorn main:app --host 0.0.0.0 --port 8000 --reload\"" 2>/dev/null || \
    (cd "$PROJECT_ROOT/backend" && uvicorn main:app --host 0.0.0.0 --port 8000 --reload &)
  sleep 2
fi

# Start Next.js frontend on port 3000
if port_in_use 3000; then
  echo "⚠️  Port 3000 in use — Next.js may already be running"
else
  echo "🌐 Starting Next.js Frontend (port 3000)..."
  osascript -e "tell app \"Terminal\" to do script \"cd $PROJECT_ROOT/frontend && npm run dev\"" 2>/dev/null || \
    (cd "$PROJECT_ROOT/frontend" && npm run dev &)
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Services starting in separate tabs    ║"
echo "║                                        ║"
echo "║  IDOL Avatar:  http://localhost:8001   ║"
echo "║  IDM-VTON:     http://localhost:8002   ║"
echo "║  VEXA Backend: http://localhost:8000   ║"
echo "║  VEXA App:     http://localhost:3000   ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Health checks:"
echo "  curl http://localhost:8001/health"
echo "  curl http://localhost:8002/health"
echo "  curl http://localhost:8000/health"
