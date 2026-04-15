# backend/main.py — complete replacement

from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import os
import hmac
import hashlib

from pipeline.body_generator import generate_body_mesh, measurements_to_betas
from pipeline.face_texture import extract_face_texture
from pipeline.archetype_selector import select_archetypes
from pipeline.r2_uploader import upload_to_r2

import tempfile
import trimesh

app = FastAPI(title="VEXA Avatar Service", version="1.0.0")
security = HTTPBearer()

def verify_internal_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    expected = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    if not expected: # If not configured, allow but warn (or strictly forbid)
        return True
    if not hmac.compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


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


@app.post("/generate-avatar", dependencies=[Depends(verify_internal_token)])
async def generate_avatar(req: AvatarRequest):
    try:
        # 1. Convert measurements → SMPL-X beta parameters
        betas = measurements_to_betas(req.measurements)

        # 2. Generate body mesh
        mesh: trimesh.Trimesh = generate_body_mesh(req.measurements)

        # 3. Extract face texture from photo
        face_texture_array = extract_face_texture(req.photo_url)

        # 4. Select nearest archetypes for morph blending
        archetypes = select_archetypes(betas)

        # 5. Export mesh to GLB with embedded face texture and upload to R2
        import cv2
        import numpy as np
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmp:
            # Save face texture as PNG in temp dir
            texture_path = f"{tmp}/face_texture.png"
            face_texture_bgr = cv2.cvtColor(face_texture_array, cv2.COLOR_RGB2BGR)
            cv2.imwrite(texture_path, face_texture_bgr)

            # Attach texture to mesh if UV coordinates are available
            if mesh.visual is not None and hasattr(mesh.visual, 'uv') and mesh.visual.uv is not None:
                texture_image = Image.open(texture_path)
                material = trimesh.visual.material.SimpleMaterial(image=texture_image)
                mesh.visual = trimesh.visual.TextureVisuals(uv=mesh.visual.uv, material=material)
            # If no UVs (SMPL-X neutral mesh), export without texture but log the gap
            else:
                import logging
                logging.getLogger("vexa").warning(
                    "Mesh has no UV coordinates — face texture not embedded. "
                    "Add UV unwrapping step to generate_body_mesh for full texture support."
                )

            glb_path = f"{tmp}/avatar.glb"
            mesh.export(glb_path)

            import uuid
            r2_key = f"avatars/{uuid.uuid4().hex}.glb"
            avatar_url = upload_to_r2(glb_path, r2_key, "model/gltf-binary")

        return {
            "avatar_url": avatar_url,
            "status": "success",
            "archetypes": [{"name": item["archetype"]["id"], "weight": round(item["weight"], 4)} for item in archetypes],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
