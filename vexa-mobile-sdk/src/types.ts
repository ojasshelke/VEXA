export interface VexaConfig {
  apiKey: string;
  apiBaseUrl: string;
}

export interface Measurements {
  heightCm: number;
  chestCm: number;
  waistCm: number;
  hipsCm: number;
  inseamCm: number;
  shoulderWidthCm: number;
  weightKg?: number;
  gender?: 'male' | 'female' | 'neutral';
}

export interface TryOnResult {
  resultUrl: string;
  cached: boolean;
}

export interface AvatarResult {
  avatarUrl: string;
  status: 'ready' | 'error';
}

export type TryOnStatus = 'idle' | 'loading' | 'ready' | 'error';
export type AvatarStatus = 'idle' | 'generating' | 'ready' | 'error';
