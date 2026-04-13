'use client'
import { useTryOnStore } from '@/store/tryOnStore'
import type { Product } from '@/types'

export function useTryOn() {
  const { results, selectedProduct, isProcessing, setResult, setSelectedProduct, setProcessing } = useTryOnStore()
  async function triggerTryOn(product: Product, userId: string) {
    // TODO: POST to /api/tryon, update store with result
  }
  async function triggerBatch(products: Product[], userId: string) {
    // TODO: POST to /api/tryon/batch, stream results via SSE
  }
  return { results, selectedProduct, isProcessing, triggerTryOn, triggerBatch, setSelectedProduct }
}
