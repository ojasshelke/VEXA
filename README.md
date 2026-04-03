# VEXA — AI 3D Body Avatar Platform

VEXA is an enterprise-grade B2B SaaS platform that enables fashion marketplaces to provide personalized 3D try-on experiences. By converting simple user measurements and a single photo into a high-fidelity SMPL-X 3D avatar, VEXA helps shoppers visualize fit and style, significantly reducing return rates and increasing conversion.

The platform is built with a high-performance Next.js frontend, a GPU-accelerated Python inference backend for avatar generation, and a robust API layer for seamless marketplace integration via an embeddable plugin script.

## Project Structure

```bash
.
├── frontend/           # Next.js App, UI Components, and API Gateways
├── backend/            # Python FastAPI Microservice (SMPL-X Inference)
└── README.md           # Main project documentation
```

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+ (for the avatar service)
- Supabase Account
- Cloudflare R2 or AWS S3 Bucket

### Local Setup (Next.js)
1. Clone the repository and navigate to the `frontend` folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local` and fill in the required credentials.
4. Run the development server:
   ```bash
   npm run dev
   ```

### Local Setup (Avatar Service)
1. Navigate to the `backend` folder.
2. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```
3. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anonymous Client Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (Server-side) |
| `AVATAR_SERVICE_URL` | URL of the Python FastAPI service (default: http://localhost:8000) |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID |
| `R2_BUCKET_NAME` | Name of your R2 bucket (e.g., vexa-assets) |
| `HUGGINGFACE_API_KEY` | API Key for IDM-VTON try-on inference |

## Marketplace Integration

To integrate VEXA into any marketplace, copy the follow script tag into the `<head>` of your product pages:

```html
<script 
  src="https://vexa.sh/embed.js" 
  data-key="YOUR_MARKETPLACE_API_KEY"
  data-product-id="PROD_123"
  data-product-image="https://market.com/outfit.jpg">
</script>
```

This script automatically injects the **VEXA Try-On Overlay** button onto your site. When clicked, it opens a secure iframe where users can calibrate their body and see the selected product on their digital double.

## License
Proprietary — Vexa Technologies Inc.
