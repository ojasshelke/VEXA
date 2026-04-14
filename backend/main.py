# backend/main.py — complete replacement

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os

from pipeline.body_generator import generate_body_mesh, measurements_to_betas
from pipeline.face_texture import extract_face_texture
from pipeline.archetype_selector import select_archetypes
from pipeline.r2_uploader import upload_to_r2

import tempfile
import trimesh

app = FastAPI(title="VEXA Avatar Service", version="1.0.0")


class Measurements(BaseModel):
    height: float
    chest: float
    waist: float
    hips: float
    inseam: float
    shoulder_width: float


class AvatarRequest(BaseModel):
    photo_url: str
    measurements: Measurements


@app.get("/health")
async def health():
    return {"status": "ok", "service": "vexa-avatar"}


@app.post("/generate-avatar")
async def generate_avatar(req: AvatarRequest):
    try:
        # 1. Convert measurements → SMPL-X beta parameters
        betas = measurements_to_betas(req.measurements)

        # 2. Generate body mesh
        mesh: trimesh.Trimesh = generate_body_mesh(req.measurements)

        # 3. Extract face texture from photo
        face_texture = extract_face_texture(req.photo_url)

        # 4. Select nearest archetypes for morph blending
        archetypes = select_archetypes(betas)

        # 5. Export mesh to GLB and upload to R2
        with tempfile.TemporaryDirectory() as tmp:
            glb_path = f"{tmp}/avatar.glb"
            mesh.export(glb_path)

            import uuid
            r2_key = f"avatars/{uuid.uuid4().hex}.glb"
            avatar_url = upload_to_r2(glb_path, r2_key, "model/gltf-binary")

        return {
            "avatar_url": avatar_url,
            "status": "success",
            "archetypes": [{"name": a, "weight": round(w, 4)} for a, w in archetypes],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
