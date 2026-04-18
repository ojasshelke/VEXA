import torch
import math

# Archetype catalog — 10 prototypical body shapes
ARCHETYPES = [
    {"id": "arch_001", "label": "Neutral",    "betas": [ 0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_002", "label": "Athletic",   "betas": [ 1.5, -0.5,  2.0,  0.0,  1.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_003", "label": "Curvy",      "betas": [ 2.0,  0.5, -1.5,  3.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_004", "label": "Tall/Lean",  "betas": [-1.0,  2.5,  0.0, -1.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_005", "label": "Petite",     "betas": [-2.0, -2.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_006", "label": "Broad",      "betas": [ 3.0,  0.0,  1.0,  0.0,  2.5,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_007", "label": "Slender",    "betas": [-1.5,  0.5, -0.5, -2.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_008", "label": "Stocky",     "betas": [ 2.5, -1.5,  3.0,  1.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_009", "label": "Full",       "betas": [ 4.0,  0.0,  0.0,  2.5,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
    {"id": "arch_010", "label": "Soft",       "betas": [ 1.0,  0.0, -2.5,  1.5,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]},
]

TEMPERATURE = 0.5  # Controls softmax sharpness

def select_archetypes(betas, k: int = 3, top_k: int | None = None):
    """
    Select the k nearest archetypes and return softmax-weighted blends.
    Returns format matches backend tests: [{"archetype": arch, "weight": w}, ...]
    """
    if top_k is not None:
        k = top_k
    
    if not isinstance(betas, torch.Tensor):
        betas = torch.tensor(betas)
    if betas.ndim == 1:
        betas = betas.unsqueeze(0)

    scored = []
    for arch in ARCHETYPES:
        a_betas = torch.tensor(arch["betas"]).unsqueeze(0)
        dist = torch.sum((betas - a_betas) ** 2).item()
        scored.append({"archetype": arch, "distance": dist})

    # Sort by distance
    scored.sort(key=lambda x: x["distance"])
    top_items = scored[:k]

    # Softmax over negative distances
    logits = [-item["distance"] / TEMPERATURE for item in top_items]
    max_logit = max(logits)
    exps = [math.exp(l - max_logit) for l in logits]
    sum_exps = sum(exps)
    weights = [e / sum_exps for e in exps]

    results = []
    for i, item in enumerate(top_items):
        results.append({
            "archetype": item["archetype"],
            "weight": round(weights[i], 6)
        })

    return results
