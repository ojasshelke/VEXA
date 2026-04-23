'use client'
import { useTryOnStore } from '@/store/tryOnStore'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types'

export function useTryOn() {
  const { results, selectedProduct, isProcessing, setResult, setSelectedProduct, setProcessing } = useTryOnStore()

  async function triggerTryOn(product: Product, userId: string, userPhotoUrl?: string) {
    setProcessing(true)
    setSelectedProduct(product)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[useTryOn] triggerTryOn:', { productId: product.id, userId, hasSession: !!session })

      const res = await fetch('/api/tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          userId,
          productId: product.id,
          userPhotoUrl: userPhotoUrl || product.image_url,
          productImageUrl: product.clothing_image_url || product.image_url,
          category: product.category === 'bottoms' ? 'lower_body'
                  : product.category === 'dresses' ? 'dresses'
                  : 'upper_body',
        }),
      })
      const data = await res.json()
      console.log('[useTryOn] Result:', data)
      setResult(product.id, {
        id: data.jobId || Math.random().toString(),
        status: data.status,
        productId: product.id,
        result_url: data.resultUrl,
      })
    } catch (err) {
      console.error('[useTryOn] triggerTryOn error:', err)
      setResult(product.id, { id: '', status: 'error', productId: product.id })
    } finally {
      setProcessing(false)
    }
  }

  async function triggerBatch(products: Product[], userId: string) {
    setProcessing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/tryon/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ userId, productIds: products.map(p => p.id), products }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        setProcessing(false)
        return
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data:'))

        for (const line of lines) {
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') {
            setProcessing(false)
            return
          }
          try {
            const result = JSON.parse(payload)
            setResult(result.productId, result)
          } catch (parseErr) {
            console.error('[useTryOn] SSE parse error:', parseErr)
          }
        }
      }
    } catch (err) {
      console.error('[useTryOn] triggerBatch error:', err)
    } finally {
      setProcessing(false)
    }
  }

  return { results, selectedProduct, isProcessing, triggerTryOn, triggerBatch, setSelectedProduct }
}
