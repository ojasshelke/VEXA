'use client';

import { useState, useEffect } from 'react';
import type { ProductCategory } from '@/types';

interface UseClothingGlbResult {
  glbUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

interface ClothingApiJson {
  glbUrl?: string;
  error?: string;
}

export function useClothingGlb(
  productId: string | undefined,
  productImageUrl: string | undefined,
  category: ProductCategory = 'tops'
): UseClothingGlbResult {
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !productImageUrl) return;

    const generate = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/clothing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            productImageUrl,
            category,
          }),
        });
        const data: ClothingApiJson = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to generate clothing mesh');
        }
        if (!data.glbUrl) {
          throw new Error('No GLB URL in response');
        }
        setGlbUrl(data.glbUrl);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };

    void generate();
  }, [productId, productImageUrl, category]);

  return { glbUrl, isLoading, error };
}
