import torch
import math

ARCHETYPES = {
    'slim':     torch.tensor([[-2.0] + [0.0]*9]),
    'average':  torch.tensor([[0.0]*10]),
    'athletic': torch.tensor([[-0.5, 1.5] + [0.0]*8]),
    'broad':    torch.tensor([[1.0, 1.0] + [0.0]*8]),
    'plus':     torch.tensor([[3.0] + [0.0]*9]),
}

TEMPERATURE = 0.5  # Must match frontend morphEngine.ts


def select_archetypes(betas: torch.Tensor, k: int = 3):
    """
    Select the k nearest archetypes by L2 distance and return
    softmax-weighted blends. Matches frontend morphEngine.ts logic exactly.
    """
    distances = {}
    for name, a_betas in ARCHETYPES.items():
        dist = torch.sum((betas - a_betas) ** 2).item()  # L2 squared, matches frontend
        distances[name] = dist

    sorted_dists = sorted(distances.items(), key=lambda x: x[1])
    top_k = sorted_dists[:k]

    # Softmax over negative distances (matches frontend softmaxWeights)
    logits = [-d / TEMPERATURE for _, d in top_k]
    max_logit = max(logits)
    exps = [math.exp(l - max_logit) for l in logits]
    sum_exps = sum(exps)
    weights = [e / sum_exps for e in exps]

    return [(name, round(w, 6)) for (name, _), w in zip(top_k, weights)]
