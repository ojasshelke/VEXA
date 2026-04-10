import torch

ARCHETYPES = {
    'slim': torch.tensor([[-2.0] + [0.0]*9]),
    'average': torch.tensor([[0.0]*10]),
    'athletic': torch.tensor([[-0.5, 1.5] + [0.0]*8]),
    'broad': torch.tensor([[1.0, 1.0] + [0.0]*8]),
    'plus': torch.tensor([[3.0] + [0.0]*9]),
}

def select_archetypes(betas: torch.Tensor):
    distances = {}
    for name, a_betas in ARCHETYPES.items():
        dist = torch.norm(betas - a_betas, p=2).item()
        distances[name] = dist
        
    sorted_dists = sorted(distances.items(), key=lambda x: x[1])
    top_2 = sorted_dists[:2]
    
    arch_1, dist_1 = top_2[0]
    arch_2, dist_2 = top_2[1]
    
    if dist_1 + dist_2 == 0:
        weight_1 = 1.0
        weight_2 = 0.0
    else:
        # Predict blended scaling interpolation using softmax inverted distances
        weight_1 = dist_2 / (dist_1 + dist_2)
        weight_2 = dist_1 / (dist_1 + dist_2)
        
    return [
        (arch_1, weight_1),
        (arch_2, weight_2)
    ]
