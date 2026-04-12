import { useState, useCallback } from 'react';
import type { VexaConfig, TryOnResult, TryOnStatus } from '../types';

interface TriggerTryOnParams {
  userId: string;
  userPhotoUrl: string;
  productImageUrl: string;
  productId: string;
}

interface TryOnApiResponse {
  result_url?: string;
  error?: string;
  cached?: boolean;
}

interface UseTryOnResult {
  tryOnResult: TryOnResult | null;
  status: TryOnStatus;
  error: string | null;
  triggerTryOn: (params: TriggerTryOnParams) => Promise<void>;
}

export function useTryOn(config: VexaConfig): UseTryOnResult {
  const [tryOnResult, setTryOnResult] = useState<TryOnResult | null>(null);
  const [status, setStatus] = useState<TryOnStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const triggerTryOn = useCallback(
    async (params: TriggerTryOnParams): Promise<void> => {
      setStatus('loading');
      setError(null);

      try {
        const res = await fetch(`${config.apiBaseUrl}/api/tryon`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vexa-key': config.apiKey,
          },
          body: JSON.stringify({
            user_id: params.userId,
            user_photo_url: params.userPhotoUrl,
            product_image_url: params.productImageUrl,
            product_id: params.productId,
          }),
        });

        const raw: unknown = await res.json();
        if (raw === null || typeof raw !== 'object') {
          throw new Error('Invalid response from server');
        }
        const data = raw as TryOnApiResponse;

        if (!res.ok) {
          throw new Error(data.error ?? 'Try-on failed');
        }

        const resultUrl = data.result_url;
        if (!resultUrl) {
          throw new Error('No result_url in response');
        }

        setTryOnResult({ resultUrl, cached: data.cached ?? false });
        setStatus('ready');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [config]
  );

  return { tryOnResult, status, error, triggerTryOn };
}
