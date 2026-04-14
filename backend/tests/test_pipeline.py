import pytest
import torch
from pipeline.body_generator import measurements_to_betas
from pipeline.archetype_selector import select_archetypes


class FakeMeasurements:
    height = 170.0
    chest = 92.0
    waist = 78.0
    hips = 96.0
    inseam = 80.0
    shoulder_width = 44.0


def test_measurements_to_betas_shape():
    betas = measurements_to_betas(FakeMeasurements())
    assert betas.shape == (1, 10)


def test_measurements_to_betas_nonzero_for_non_average():
    tall = FakeMeasurements()
    tall.height = 195.0
    betas = measurements_to_betas(tall)
    # Height delta should produce non-zero beta[1]
    assert betas[0, 1].item() != 0.0


def test_select_archetypes_returns_k():
    betas = torch.zeros(1, 10)
    result = select_archetypes(betas, k=3)
    assert len(result) == 3


def test_select_archetypes_weights_sum_to_one():
    betas = torch.zeros(1, 10)
    result = select_archetypes(betas, k=3)
    total = sum(w for _, w in result)
    assert abs(total - 1.0) < 1e-5


def test_select_archetypes_average_is_nearest_to_zero():
    betas = torch.zeros(1, 10)
    result = select_archetypes(betas, k=5)
    top_name = result[0][0]
    assert top_name == 'average'
