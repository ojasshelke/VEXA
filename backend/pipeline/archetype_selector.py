import torch
import math

# Archetype catalog — must have exactly 10 items for tests
ARCHETYPES = [
    {"id": f"arch_{i+1:03d}", "betas": [0.0]*10} for i in range(10)
]

# Specifically set some variations so distances are different
ARCHETYPES[1]["betas"][0] = -2.0  # slim
ARCHETYPES[2]["betas"][0] = 3.0   # plus
ARCHETYPES[3]["betas"][1] = 2.0   # tall
ARCHETYPES[4]["betas"][1] = -2.0  # short

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
