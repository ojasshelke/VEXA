import type { Measurements, FitLabel } from '@/types'
export function cmToInches(cm: number): number { return cm / 2.54 }
export function inchesToCm(inches: number): number { return inches * 2.54 }
export function validateMeasurements(m: Partial<Measurements>): string[] {
  // TODO: return array of validation error messages
  return []
}
export function computeFitLabel(userCm: number, garmentCm: number): FitLabel {
  // TODO: delta comparison logic
  return 'true_to_size'
}
