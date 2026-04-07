import { create } from 'zustand'
import type { TryOnResult, Product } from '@/types'

type TryOnState = {
  results: Record<string, TryOnResult>
  selectedProduct: Product | null
  isProcessing: boolean
  setResult: (productId: string, result: TryOnResult) => void
  setSelectedProduct: (product: Product | null) => void
  setProcessing: (processing: boolean) => void
  clearResults: () => void
}

export const useTryOnStore = create<TryOnState>((set) => ({
  results: {},
  selectedProduct: null,
  isProcessing: false,
  setResult: (productId, result) =>
    set((state) => ({ results: { ...state.results, [productId]: result } })),
  setSelectedProduct: (selectedProduct) => set({ selectedProduct }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  clearResults: () => set({ results: {} }),
}))
