import torch
import trimesh
import smplx


def measurements_to_betas(measurements) -> torch.Tensor:
    """
    Heuristic linear mapping from body measurements to SMPL-X 10-dim betas.
    Beta[0] controls overall body size (positive = larger).
    Beta[1] controls height/slenderness.
    Beta[2] controls waist-to-hip ratio.
    Remaining betas are zeroed (require learned regression for accuracy).
    """
    # Normalize against average adult measurements (cm)
    AVG_HEIGHT = 170.0
    AVG_CHEST = 92.0
    AVG_WAIST = 78.0
    AVG_HIPS = 96.0

    height_delta = (measurements.height - AVG_HEIGHT) / AVG_HEIGHT
    chest_delta = (measurements.chest - AVG_CHEST) / AVG_CHEST
    waist_delta = (measurements.waist - AVG_WAIST) / AVG_WAIST
    hip_delta = (measurements.hips - AVG_HIPS) / AVG_HIPS

    betas = torch.zeros(1, 10)
    betas[0, 0] = float(chest_delta * 3.0)       # overall size
    betas[0, 1] = float(height_delta * 2.0)       # height
    betas[0, 2] = float((waist_delta - hip_delta) * 2.0)  # waist-hip ratio
    betas[0, 3] = float(waist_delta * 1.5)        # belly
    return betas


def generate_body_mesh(measurements) -> trimesh.Trimesh:
    model = smplx.create(
        model_path='models/',
        model_type='smplx',
        gender='neutral',
        use_face_contour=False,
        num_betas=10,
        ext='npz'
    )

    betas = measurements_to_betas(measurements)
    output = model(betas=betas, return_verts=True)

    vertices = output.vertices.detach().cpu().numpy().squeeze()
    faces = model.faces
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
    return mesh
