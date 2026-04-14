import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ARSessionRequestBody, ARSessionResponse } from '@/types';

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL or key not configured');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseBody(raw: unknown): ARSessionRequestBody | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const userId = o.userId;
  const productId = o.productId;
  if (typeof userId !== 'string' || userId.length === 0) return null;
  if (typeof productId !== 'string' || productId.length === 0) return null;
  return { userId, productId };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const body = parseBody(parsed);
    if (!body) {
      return NextResponse.json(
        { error: 'Missing userId or productId' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { error: insertError } = await supabase.from('usage_logs').insert({
      endpoint: 'ar_session',
      user_id: body.userId,
      product_id: body.productId,
    });

    if (insertError) {
      console.warn('[/api/ar/session] usage_logs insert:', insertError.message);
    }

    const token = `ar_${Date.now()}_${body.userId.slice(0, 8)}`;
    const payload: ARSessionResponse = {
      sessionToken: token,
      message: 'AR session started',
    };

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
