import type { Archetype } from '@/types'
export function computeBetaDistance(a: number[], b: number[]): number {
  // TODO: Euclidean L2 distance between two SMPL-X beta vectors
  return 0
}
export function selectArchetypes(
  userBetas: number[],
  archetypes: Archetype[],
  topK = 3
): { archetype: Archetype; weight: number }[] {
  // TODO: L2 distance + softmax blend weights
  return []
}
