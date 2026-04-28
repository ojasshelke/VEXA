<div align="center">
  <img src="https://raw.githubusercontent.com/ojasshelke/VEXA/master/frontend/public/icon.png" width="100" height="100" alt="VEXA Logo" style="border-radius: 20px; box-shadow: 0 0 20px rgba(190,242,100,0.4);" onerror="this.src='https://via.placeholder.com/100?text=VEXA'">
  
  <h1 style="border-bottom: none; margin-bottom: 0;">VEXA — AI Virtual Try-On Platform</h1>
  
  <p><b>Turn any selfie into a 3D avatar. Try on any garment instantly.</b></p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/Python-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/Three.js-WebGL-black?style=for-the-badge&logo=three.js" alt="Three.js" />
    <img src="https://img.shields.io/badge/Supabase-DB-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/AI-Fashn.ai-BEF264?style=for-the-badge&logo=openai&logoColor=black" alt="Fashn.ai" />
  </p>
</div>

> VEXA is a B2B SaaS platform that gives fashion marketplaces photorealistic virtual try-on, powered by IDOL (CVPR 2025) for 3D avatars and Fashn.ai for seamless garment transfer.

```text
┌─────────────────────────────────────────────────────────────────┐
│                        VEXA PIPELINE                            │
│                                                                 │
│  User Selfie ──► IDOL (3D Avatar) ──► AvatarViewer (Three.js)   │
│                                                                 │
│  User Photo + Garment ──► Fashn.ai API ──► Try-On Result Image  │
└─────────────────────────────────────────────────────────────────┘
```

### 🚀 Running Services

| Service | What it does | Port | Tech |
|---------|-------------|------|------|
| **Frontend** | Web app — onboarding, avatar viewer, try-on UI, dashboard | `:3000` | Next.js, React 19, Three.js |
| **VEXA Backend** | Avatar pipeline proxy, SMPL-X fallback, routing | `:8000` | Python FastAPI |
| **IDOL Avatar** | Generates 3D `.glb` avatar from a single photo | `:8001` | PyTorch, HuggingFace |
| **Fashn.ai** | Transfers garment onto person photo (Cloud API) | `Cloud` | REST API |
| **Supabase** | Auth, PostgreSQL database, file storage | `Cloud` | Supabase |

---

## Architecture

VEXA/
├── frontend/          # Next.js 16, React 19, Three.js, Zustand
├── backend/           # Python FastAPI — avatar pipeline proxy
├── vexa-mobile-sdk/   # React Native SDK for marketplace embed
└── start_all.sh       # One command to start everything (Mac)
```

External AI repos live **outside** this repo:

```text
~/Documents/
├── VEXA/              # ← This repo (clone from GitHub)
└── IDOL/              # Clone from github.com/yiyuzhuang/IDOL
```

---

## Prerequisites

Install every tool below before proceeding. Commands are shown for both Mac and Windows.

### Node.js 18+

**Mac:**
```bash
brew install node
# OR use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows:**
```powershell
# Download from nodejs.org/en/download
# OR use winget
winget install OpenJS.NodeJS.LTS
# OR use nvm-windows
winget install coreybutler.NVMforWindows
nvm install 18
nvm use 18
```

### Python 3.10+

**Mac:**
```bash
brew install python@3.10
# Verify
python3 --version
```

**Windows:**
```powershell
winget install Python.Python.3.10
# Verify
python --version
```

### Conda (required for IDOL and IDM-VTON)

**Mac:**
```bash
brew install --cask miniconda
conda init zsh   # or bash
```

**Windows:**
```powershell
winget install Anaconda.Miniconda3
# Restart terminal, then:
conda init powershell
```

### Git LFS (for large model files)

**Mac:**
```bash
brew install git-lfs
git lfs install
```

**Windows:**
```powershell
winget install GitHub.GitLFS
git lfs install
```

### uv (fast Python package installer)

**Mac:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows:**
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

> **Note:** `uv` installs packages 10–100× faster than pip. The backend `start.sh` uses `uv` when available and falls back to pip.

---

## Step 1 — Clone All Repos

# Clone VEXA main repo
git clone https://github.com/ojasshelke/VEXA.git
cd VEXA

# Clone IDOL (3D avatar model) — place OUTSIDE VEXA
cd ~/Documents          # Mac
# cd %USERPROFILE%\Documents   # Windows
git clone https://github.com/yiyuzhuang/IDOL.git
```

After cloning you should have:

```text
~/Documents/
├── VEXA/
│   ├── frontend/
│   ├── backend/
│   ├── vexa-mobile-sdk/
│   └── start_all.sh
└── IDOL/
```

---

## Step 2 — Set Up IDOL (3D Avatar)

### Mac

```bash
cd ~/Documents/IDOL

# Create isolated conda environment
conda create -n idol python=3.10 -y
conda activate idol

# Install PyTorch with MPS support (Apple Silicon)
pip install torch torchvision torchaudio

# Install dependencies (use uv for speed if available)
pip install huggingface_hub fastapi uvicorn python-multipart
pip install trimesh pillow einops timm omegaconf
pip install -r requirements.txt || true

# Download model weights (~5-8 GB — takes ~10 min on first run)
python -c "
from huggingface_hub import snapshot_download
snapshot_download(
  repo_id='yiyuzhuang/IDOL',
  local_dir='./checkpoints',
  ignore_patterns=['*.git*', 'README*']
)
print('IDOL weights downloaded successfully')
"
```

### Windows

```powershell
cd $env:USERPROFILE\Documents\IDOL

# Create conda environment
conda create -n idol python=3.10 -y
conda activate idol

# Install PyTorch with CUDA support (NVIDIA GPU)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# If no NVIDIA GPU (CPU only):
# pip install torch torchvision torchaudio

# Install dependencies
pip install huggingface_hub fastapi uvicorn python-multipart
pip install trimesh pillow einops timm omegaconf
pip install -r requirements.txt

# Download weights
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='yiyuzhuang/IDOL', local_dir='./checkpoints')"
```

### MPS Patch (Mac Apple Silicon only)

After installing, run this patch so IDOL works on M1/M2/M3/M4:

```bash
cd ~/Documents/IDOL
# Replace CUDA references with MPS-compatible device detection
find . -name "*.py" -exec sed -i '' \
  "s/device = 'cuda'/device = 'mps' if torch.backends.mps.is_available() else 'cpu'/g" {} \;
find . -name "*.py" -exec sed -i '' \
  's/torch\.float16/torch.float32/g' {} \;
```

### Test IDOL

```bash
# Mac
conda activate idol
cd ~/Documents/IDOL
curl -L -o test.jpg "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=512"
python run_demo.py --image test.jpg --render_mode reconstruct --output_dir ./test_output
ls ./test_output   # should show .glb or .obj file
```

```powershell
# Windows
conda activate idol
cd $env:USERPROFILE\Documents\IDOL
python run_demo.py --image test.jpg --render_mode reconstruct --output_dir test_output
dir test_output
```



---

## Step 4 — Set Up VEXA Frontend

### Mac + Windows (same commands)

```bash
cd VEXA/frontend

# Install dependencies
npm install

# If npm install fails with peer dependency conflicts:
npm install --legacy-peer-deps
```

### Copy and fill environment file

**Mac:**
```bash
cp .env.local.example .env.local
nano .env.local   # or: code .env.local
```

**Windows:**
```powershell
copy .env.local.example .env.local
notepad .env.local   # or: code .env.local
```

### Frontend `.env.local` — every variable explained

```bash
# ── Supabase ──────────────────────────────────────────────────
# Get from: supabase.com → your project → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...       # Server-side only — never expose

# Storage bucket name (create in Dashboard → Storage)
SUPABASE_STORAGE_BUCKET=avatars

# ── HuggingFace ──────────────────────────────────────────────
# Get from: huggingface.co/settings/tokens
# Create a token named "VEXA" with "Read" + "Inference" permissions
HUGGINGFACE_API_KEY=hf_...

# ── Meshy (3D clothing mesh generation) ──────────────────────
# Get from: meshy.ai → API Keys (200 free credits/month)
MESHY_API_KEY=

# ── Cloudflare R2 (optional for local dev) ───────────────────
# Results fall back to inline base64 if R2 is not configured
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=vexa-assets
R2_PUBLIC_URL=

# ── Local AI Services ────────────────────────────────────────
AVATAR_SERVICE_URL=http://127.0.0.1:8000
PYTHON_SERVICE_URL=http://127.0.0.1:8000
INTERNAL_SERVICE_TOKEN=vx_internal_dev     # Must match backend/.env

# ── App ──────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
DEV_API_KEY=vx_dev_local_only

# ── Optional ─────────────────────────────────────────────────
# INTERNAL_ONBOARDING_KEY=vx_internal_changeme
# STORAGE_BASE_URL=https://cdn.vexa.dev
# NEXT_PUBLIC_SENTRY_DSN=
```

---

## Step 5 — Set Up VEXA Backend

### Mac

```bash
cd VEXA/backend

# Option A — using uv (10× faster, recommended)
pip install uv
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Option B — standard pip
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Windows

```powershell
cd VEXA\backend

# Option A — using uv (recommended)
pip install uv
uv venv
.venv\Scripts\activate
uv pip install -r requirements.txt

# Option B — standard pip
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Copy backend env

**Mac:**
```bash
cp .env.example .env
nano .env
```

**Windows:**
```powershell
copy .env.example .env
notepad .env
```

### Backend `.env` — every variable explained

```bash
# ── Cloudflare R2 ────────────────────────────────────────────
# Only required for /generate-avatar-full (SMPL-X pipeline).
# The dev stub /generate-avatar does NOT need R2.
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=vexa-assets
R2_PUBLIC_URL=

# Must match frontend's INTERNAL_SERVICE_TOKEN
INTERNAL_SERVICE_TOKEN=vx_internal_dev

# Where the Next.js frontend is served from
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Comma-separated additional CORS origins
# ALLOWED_ORIGINS=https://staging.example.com

# Path to SMPL-X model weights — only needed for /generate-avatar-full
SMPLX_MODEL_PATH=models/
```

---

## Step 6 — Set Up Supabase Database

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Go to **SQL Editor** → run each file **in this order**:

| # | File | What it creates |
|---|------|----------------|
| 1 | `frontend/supabase/avatars.sql` | `avatars` table — stores GLB URLs per user |
| 2 | `frontend/supabase/tryon_results.sql` | `tryon_results` table — try-on output images |
| 3 | `frontend/supabase/api_keys.sql` | `api_keys` table — marketplace API key management |
| 4 | `frontend/supabase/clothing_assets.sql` | `clothing_assets` table — garment GLB meshes |
| 5 | `frontend/supabase/usage_logs.sql` | `usage_logs` table — API call tracking |
| 6 | `frontend/supabase/api_usage_rpc.sql` | `increment_api_key_usage()` RPC function |
| 7 | `frontend/supabase/size_charts_users_accessories.sql` | Size chart columns + user measurements |
| 8 | `frontend/supabase/video_jobs.sql` | `video_jobs` table — video try-on processing |
| 9 | `frontend/supabase/admin_logs.sql` | `admin_logs` table — admin action audit trail |

3. Go to **Storage** → Create bucket named `avatars` → set to **Public**
4. Copy **Project URL** and **API keys** into your `frontend/.env.local`

---

## Step 7 — Start Everything

### Mac (one command)

```bash
cd VEXA
chmod +x start_all.sh
./start_all.sh
```

This opens **3 Terminal tabs** automatically:

| Tab | Service | Port |
|-----|---------|------|
| 1 | IDOL Avatar Service | `:8001` |
| 2 | VEXA Python Backend | `:8000` |
| 3 | Next.js Frontend | `:3000` |

### Windows (run each in a separate PowerShell tab)

**Tab 1 — IDOL:**
```powershell
cd $env:USERPROFILE\Documents\IDOL
conda activate idol
uvicorn vexa_idol_server:app --host 0.0.0.0 --port 8001
```

**Tab 2 — VEXA Backend:**
```powershell
cd VEXA\backend
.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Tab 3 — Frontend:**
```powershell
cd VEXA\frontend
npm run dev
```

### Verify everything is running

```bash
curl http://localhost:8001/health   # IDOL
curl http://localhost:8000/health   # VEXA Backend
# Then open http://localhost:3000
```

---

## Development Workflow

### Run tests

```bash
cd frontend
npm run test            # run once
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
```

### Frontend only (if AI models not needed)

```bash
cd frontend && npm run dev
# App works with a placeholder avatar if IDOL is not running
```

### Useful scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Next.js dev server on `:3000` |
| `npm run build` | Production build — **must pass before PR** |
| `npm run lint` | ESLint check |
| `npm run test` | Run Vitest test suite |
| `./backend/start.sh` | Install deps + start Python backend |
| `./start_all.sh` | Start all 4 services (Mac only) |

---

## Troubleshooting

### 🍎 Mac Specific

**IDOL: "MPS not available"**
```bash
python -c "import torch; print(torch.backends.mps.is_available())"
# Must return True on M1/M2/M3/M4
# If False: pip install --upgrade torch
```

**Port already in use**
```bash
lsof -ti:8001 | xargs kill -9   # kill IDOL
lsof -ti:8000 | xargs kill -9   # kill backend
lsof -ti:3000 | xargs kill -9   # kill frontend
```

**PYTORCH_MPS memory error**
```bash
export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0
# Add to ~/.zshrc to make permanent
```

**npm install fails with node-gyp errors**
```bash
npm install --legacy-peer-deps
```

**`python3` not found after brew install**
```bash
brew link python@3.10
```

### 🪟 Windows Specific

**conda not recognized**
```powershell
# Run Anaconda Prompt as Administrator, then:
conda init powershell
# Restart PowerShell
```

**IDOL: CUDA not available (no NVIDIA GPU)**
```powershell
# Edit every .py file in IDOL that has device='cuda'
# Replace with: device = 'cpu'
# CPU is slow (~5-10 min per avatar) but works
```

**IDOL float16 error on CPU**
```
RuntimeError: "LayerNormKernelImpl" not implemented for 'Half'
```
Fix: Replace all `torch.float16` with `torch.float32` in IDOL source files.

**npm install fails with node-gyp errors**
```powershell
npm install --legacy-peer-deps
# OR
npm install --force
```

**Python venv activation fails**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.venv\Scripts\activate
```

### 🔧 Common (Both Platforms)

**"HUGGINGFACE_API_KEY not configured"**
→ Add your HF token to `frontend/.env.local`
→ Get it from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

**Avatar shows placeholder (green figure)**
→ IDOL server not running — start it first
→ Check: `curl http://localhost:8001/health`

**Try-on returns user's own photo unchanged**
→ HuggingFace quota exceeded or wrong payload
→ Wait 24h for quota reset OR use local IDM-VTON on `:8002`

**"Supabase bucket not found"**
→ Go to Supabase Dashboard → Storage → Create bucket named `avatars`
→ Set bucket to **Public**

**`npm run build` fails with TypeScript errors**
→ Run `npx tsc --noEmit` to see all errors
→ Fix types — never use `@ts-ignore`

---

## Environment Variables Reference

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Where to get it |
|----------|----------|---------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | — | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | — | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | — | Supabase → Settings → API (secret) |
| `SUPABASE_STORAGE_BUCKET` | No | `avatars` | Name of your Supabase storage bucket |
| `HUGGINGFACE_API_KEY` | **Yes** | — | huggingface.co/settings/tokens |
| `MESHY_API_KEY` | No | — | meshy.ai → API Keys |
| `R2_ACCOUNT_ID` | No | — | Cloudflare dashboard → R2 |
| `R2_ACCESS_KEY_ID` | No | — | Cloudflare R2 → API tokens |
| `R2_SECRET_ACCESS_KEY` | No | — | Cloudflare R2 → API tokens |
| `R2_BUCKET_NAME` | No | `vexa-assets` | Your R2 bucket name |
| `R2_PUBLIC_URL` | No | — | Your R2 public domain |
| `AVATAR_SERVICE_URL` | No | `http://127.0.0.1:8000` | Python backend URL |
| `PYTHON_SERVICE_URL` | No | `http://127.0.0.1:8000` | Same as AVATAR_SERVICE_URL |
| `INTERNAL_SERVICE_TOKEN` | No | `vx_internal_dev` | Any shared secret (match backend) |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Your frontend URL |
| `DEV_API_KEY` | No | `vx_dev_local_only` | Dev-only marketplace key |
| `NEXT_PUBLIC_SENTRY_DSN` | No | — | Sentry → Project → DSN |

### Backend (`backend/.env`)

| Variable | Required | Default | Where to get it |
|----------|----------|---------|----------------|
| `R2_ENDPOINT` | No | — | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | No | — | Cloudflare R2 → API tokens |
| `R2_SECRET_ACCESS_KEY` | No | — | Cloudflare R2 → API tokens |
| `R2_BUCKET_NAME` | No | `vexa-assets` | Your R2 bucket name |
| `R2_PUBLIC_URL` | No | — | Your R2 public domain |
| `INTERNAL_SERVICE_TOKEN` | No | `vx_internal_dev` | Must match frontend value |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Frontend URL for fallback GLB |
| `ALLOWED_ORIGINS` | No | — | Comma-separated CORS origins |
| `SMPLX_MODEL_PATH` | No | `models/` | Path to SMPL-X `.npz` weights |

---

## API Overview

### Next.js API Routes (`frontend/src/app/api/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/avatar/generate` | Bearer | Generate 3D avatar via IDOL |
| GET | `/api/avatar/[userId]` | Bearer | Get avatar status and GLB URL |
| POST | `/api/tryon` | Bearer | Run virtual try-on (IDM-VTON) |
| GET | `/api/tryon/[productId]` | Bearer | Get try-on result for product |
| POST | `/api/tryon/batch` | Bearer | Batch try-on for product grid |
| POST | `/api/tryon/video` | Bearer | Video try-on job |
| GET | `/api/tryon/video/status` | Bearer | Poll video job status |
| POST | `/api/upload` | Bearer | Upload photo to Supabase storage |
| POST | `/api/size` | Bearer | Get AI size recommendation |
| POST | `/api/clothing` | Bearer | Create clothing asset (Meshy 3D) |
| GET | `/api/clothing/status/[taskId]` | Bearer | Poll Meshy task status |
| POST | `/api/keys/generate` | x-vexa-key | Generate marketplace API key |
| POST | `/api/keys/validate` | x-vexa-key | Validate an API key |
| POST | `/api/keys/revoke` | x-vexa-key | Revoke an API key |
| GET | `/api/keys/list` | x-vexa-key | List all API keys |
| POST | `/api/auth/signup` | None | User signup |
| POST | `/api/auth/login` | None | User login |
| GET | `/api/health` | None | Health check |
| GET | `/api/dashboard/stats` | Bearer | Dashboard statistics |
| GET | `/api/dashboard/analytics` | Bearer | Usage analytics |
| POST | `/api/ar/session` | Bearer | Create AR session |
| POST | `/api/webhook/avatar-ready` | Internal | Avatar completion webhook |
| DELETE | `/api/user/delete` | Bearer | Delete user account + data |

### Python Backend Routes (`backend/main.py`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Health check (includes IDOL status) |
| POST | `/generate-avatar` | Bearer | IDOL avatar → falls back to placeholder |
| POST | `/generate-avatar-full` | Bearer | Full SMPL-X pipeline (heavy) |

### IDOL Service (port 8001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate-avatar` | Start avatar generation job |
| GET | `/avatar-status/{id}` | Poll job status |
| GET | `/health` | Service health |

---

## Marketplace Embed (B2B)

Embed VEXA into any e-commerce site with a single script tag:

```html
<script
  src="https://vexa.sh/embed.js"
  data-key="YOUR_API_KEY"
  data-product-id="PROD_123"
  data-product-image="https://market.com/shirt.jpg">
</script>
```

This injects a **"Try On"** button. When clicked, it opens a secure iframe where users can calibrate their body and see the garment on their digital double.

Generate API keys from the VEXA dashboard at `/dashboard`.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js, React, TypeScript | 16.2.1, 19.2.4 |
| 3D Viewer | Three.js, React Three Fiber, Drei | 0.183.2 |
| AR | @react-three/xr | 6.6.29 |
| Animations | Framer Motion | 12.38.0 |
| State | Zustand | 5.0.12 |
| Styling | Tailwind CSS | 4.x |
| Charts | Recharts | 3.8.1 |
| Database | Supabase (PostgreSQL) | Hosted |
| Storage | Cloudflare R2 (S3-compatible) | — |
| 3D Avatar AI | IDOL (CVPR 2025) | PyTorch |
| Try-On AI | IDM-VTON (ECCV 2024) | PyTorch, Diffusers |
| Backend | Python FastAPI | 0.110.0 |
| Body Model | SMPL-X | 0.1.28 |
| Pose Detection | MediaPipe | 0.10.9 |
| 3D Meshing | Meshy API | — |
| Mobile SDK | React Native | — |
| Error Tracking | Sentry | 10.48.0 |
| Icons | Lucide React | 1.7.0 |

---

## Contributing

### Branch naming

```
feature/your-feature-name
fix/bug-description
chore/task-name
```

### Before every PR

```bash
cd frontend
npm run build    # must pass
npm run test     # must pass
npm run lint     # must pass
```

### Never commit

- `.env.local`
- `backend/.env`
- Any file with real API keys
- `node_modules/`
- `__pycache__/`
- `.venv/` or `venv/`
- Model checkpoints (`*.pt`, `*.bin`, `*.safetensors`)

---

## License

**Proprietary** — Vexa Technologies Inc.
Not for redistribution without written permission.

---

## Team

Built by the VEXA team.
For questions, contact the project maintainers.
