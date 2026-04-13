import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VideoTryOnStartResponse } from '@/types';

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL or key not configured');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface VideoTryOnRequestBody {
  user_id: string;
  video_url: string;
  product_image_url: string;
  product_id: string;
}

function parseVideoBody(raw: unknown): VideoTryOnRequestBody | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const user_id = o.user_id;
  const video_url = o.video_url;
  const product_image_url = o.product_image_url;
  const product_id = o.product_id;
  if (typeof user_id !== 'string' || user_id.length === 0) return null;
  if (typeof video_url !== 'string' || video_url.length === 0) return null;
  if (typeof product_image_url !== 'string' || product_image_url.length === 0)
    return null;
  if (typeof product_id !== 'string' || product_id.length === 0) return null;
  return { user_id, video_url, product_image_url, product_id };
}

interface VideoJobInsertRow {
  id: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const body = parseVideoBody(parsed);
    if (!body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { user_id, video_url, product_image_url, product_id } = body;
    const supabase = getSupabase();

    const { data: job, error: insertError } = await supabase
      .from('video_jobs')
      .insert({
        user_id,
        product_id,
        input_video_url: video_url,
        product_image_url,
        status: 'processing',
        progress_percent: 0,
      })
      .select('id')
      .single();

    if (insertError || !job) {
      throw new Error(insertError?.message ?? 'Failed to create video job');
    }

    const row = job as VideoJobInsertRow;

    const pyUrl = process.env.AVATAR_SERVICE_URL?.replace(/\/$/, '');
    if (pyUrl) {
      void fetch(`${pyUrl}/process-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: row.id,
          video_url,
          garment_image_url: product_image_url,
        }),
      }).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[video] Python dispatch failed:', msg);
      });
    }

    const payload: VideoTryOnStartResponse = {
      job_id: row.id,
      status: 'processing',
      message:
        'Video try-on started. Poll /api/tryon/video/status for progress.',
    };

    return NextResponse.json(payload, { status: 202 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/tryon/video]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
