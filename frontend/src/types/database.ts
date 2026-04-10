/**
 * Supabase database row types.
 * These must match the column names in your Supabase tables exactly.
 * Used to type the Supabase client without resorting to `any`.
 */

export interface UserRow {
  id: string;
  email: string;
  height: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  inseam: number | null;
  shoulder_width: number | null;
  avatar_url: string | null;
  face_texture_url: string | null;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  marketplace_name: string;
  key: string;
  status: 'active' | 'revoked';
  requests_count: number;
  monthly_limit: number;
  created_at: string;
}

export interface UsageLogRow {
  id: string;
  api_key_id: string;
  endpoint: string;
  status: number;
  response_time_ms: number;
  timestamp: string;
}

export interface TryOnResultRow {
  id: string;
  user_id: string;
  product_id: string;
  product_image_url: string;
  result_url: string;
  fit_label: string;
  recommended_size: string;
  created_at: string;
}

export interface SizeChartRow {
  id: string;
  product_id: string;
  marketplace: string;
  size: string;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  length: number | null;
  shoulder_width: number | null;
  created_at: string;
}

export interface Database {
  public: {
    /** Required by @supabase/supabase-js v2 typed client */
    PostgrestVersion: '12';
    Tables: {
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<UserRow, 'id'>>;
      };
      api_keys: {
        Row: ApiKeyRow;
        Insert: Omit<ApiKeyRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<ApiKeyRow, 'id'>>;
      };
      usage_logs: {
        Row: UsageLogRow;
        Insert: Omit<UsageLogRow, 'id'> & { id?: string };
        Update: Partial<Omit<UsageLogRow, 'id'>>;
      };
      tryon_results: {
        Row: TryOnResultRow;
        Insert: Omit<TryOnResultRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<TryOnResultRow, 'id'>>;
      };
      size_charts: {
        Row: SizeChartRow;
        Insert: Omit<SizeChartRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<SizeChartRow, 'id'>>;
      };
    };
  };
}
