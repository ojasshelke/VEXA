'use client'
import type { Measurements } from '@/types'

export function useMeasurements(userId: string | undefined) {
  // TODO: fetch user measurements from /api/user/measurements
  return {
    measurements: null as Measurements | null,
    isLoading: false,
    hasCompletedOnboarding: false,
  }
}
