import { useState, useCallback, useRef } from 'react';
import type { VexaConfig, Measurements, AvatarStatus } from '../types';

interface GenerateAvatarParams {
  userId: string;
  photoUri: string;
  measurements: Measurements;
}

interface AvatarGenerateResponse {
  avatar_url?: string;
  error?: string;
}

interface AvatarPollResponse {
  status?: string;
  glbUrl?: string;
}

interface UseAvatarResult {
  avatarUrl: string | null;
  status: AvatarStatus;
  error: string | null;
  generateAvatar: (params: GenerateAvatarParams) => Promise<void>;
}

const MAX_WAIT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

export function useAvatar(config: VexaConfig): UseAvatarResult {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AvatarStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateAvatar = useCallback(
    async (params: GenerateAvatarParams): Promise<void> => {
      setStatus('generating');
      setError(null);

      try {
        const res = await fetch(`${config.apiBaseUrl}/api/avatar/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vexa-key': config.apiKey,
          },
          body: JSON.stringify({
            userId: params.userId,
            photo_url: params.photoUri,
            measurements: {
              heightCm: params.measurements.heightCm,
              chestCm: params.measurements.chestCm,
              waistCm: params.measurements.waistCm,
              hipsCm: params.measurements.hipsCm,
              inseamCm: params.measurements.inseamCm,
              shoulderWidthCm: params.measurements.shoulderWidthCm,
            },
          }),
        });

        const raw: unknown = await res.json();
        if (raw === null || typeof raw !== 'object') {
          throw new Error('Invalid response from avatar service');
        }
        const data = raw as AvatarGenerateResponse;

        if (!res.ok) {
          throw new Error(data.error ?? 'Avatar generation failed');
        }

        const startTime = Date.now();

        pollRef.current = setInterval(() => {
          if (Date.now() - startTime > MAX_WAIT_MS) {
            if (pollRef.current !== null) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setError('Timeout waiting for avatar');
            setStatus('error');
            return;
          }

          void (async () => {
            try {
              const pollRes = await fetch(
                `${config.apiBaseUrl}/api/avatar/${params.userId}`,
                { headers: { 'x-vexa-key': config.apiKey } }
              );
              const pollRaw: unknown = await pollRes.json();
              if (pollRaw === null || typeof pollRaw !== 'object') return;
              const pollData = pollRaw as AvatarPollResponse;

              if (pollData.status === 'ready' && pollData.glbUrl) {
                if (pollRef.current !== null) {
                  clearInterval(pollRef.current);
                  pollRef.current = null;
                }
                setAvatarUrl(pollData.glbUrl);
                setStatus('ready');
              }
            } catch {
              // non-fatal: keep polling
            }
          })();
        }, POLL_INTERVAL_MS);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [config]
  );

  return { avatarUrl, status, error, generateAvatar };
}
