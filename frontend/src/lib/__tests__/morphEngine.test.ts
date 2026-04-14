import { describe, it, expect } from 'vitest';
import { l2SquaredDistance, softmaxWeights, computeMorphBlend } from '../morphEngine';

describe('l2SquaredDistance', () => {
  it('returns 0 for identical vectors', () => {
    expect(l2SquaredDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it('throws for mismatched lengths', () => {
    expect(() => l2SquaredDistance([1, 2], [1, 2, 3])).toThrow();
  });
});

describe('softmaxWeights', () => {
  it('weights sum to 1', () => {
    const weights = softmaxWeights([1, 2, 3]);
    const sum = weights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });
  it('closer distance gets higher weight', () => {
    const weights = softmaxWeights([0.1, 10]);
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });
});

describe('computeMorphBlend', () => {
  it('returns k archetypes', () => {
    const archetypes = [
      { id: 'a', glbUrl: '', betas: [0, 0] },
      { id: 'b', glbUrl: '', betas: [1, 0] },
      { id: 'c', glbUrl: '', betas: [2, 0] },
    ];
    const blend = computeMorphBlend([0.5, 0], archetypes, 2);
    expect(blend.archetypeIds.length).toBe(2);
    expect(blend.weights.length).toBe(2);
  });
});
