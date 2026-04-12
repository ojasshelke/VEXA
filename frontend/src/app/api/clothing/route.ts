import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ClothingCategory } from '@/types';

const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v1';

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL or key not configured');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface ClothingRequestBody {
  product_id: string;
  product_image_url: string;
  category: ClothingCategory;
}

const ALLOWED_CATEGORIES: readonly ClothingCategory[] = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'shoes',
  'accessories',
];

function isClothingCategory(value: string): value is ClothingCategory {
  return (ALLOWED_CATEGORIES as readonly string[]).includes(value);
}

interface MeshyCreateResponse {
  result: string;
}

interface MeshyTaskResponse {
  status: string;
  model_urls?: {
    glb?: string;
  };
}

interface ClothingApiSuccess {
  glb_url: string;
  cached: boolean;
}

interface ClothingApiError {
  error: string;
}

function parseRequestBody(raw: unknown): ClothingRequestBody | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const product_id = o.product_id;
  const product_image_url = o.product_image_url;
  const category = o.category;
  if (typeof product_id !== 'string' || product_id.length === 0) return null;
  if (typeof product_image_url !== 'string' || product_image_url.length === 0)
    return null;
  if (typeof category !== 'string' || !isClothingCategory(category)) return null;
  return { product_id, product_image_url, category };
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ClothingApiSuccess | ClothingApiError>> {
  try {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const body = parseRequestBody(parsed);
    if (!body) {
      return NextResponse.json(
        { error: 'Missing or invalid required fields' },
        { status: 400 }
      );
    }

    const { product_id, product_image_url, category } = body;
    const supabase = getSupabase();

    const { data: cached } = await supabase
      .from('clothing_assets')
      .select('glb_url')
      .eq('product_id', product_id)
      .maybeSingle();

    if (cached?.glb_url) {
      return NextResponse.json({ glb_url: cached.glb_url, cached: true });
    }

    const meshyKey = process.env.MESHY_API_KEY;
    if (!meshyKey) {
      return NextResponse.json(
        { error: 'MESHY_API_KEY not configured' },
        { status: 500 }
      );
    }

    const taskRes = await fetch(`${MESHY_API_BASE}/image-to-3d`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meshyKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: product_image_url,
        enable_pbr: true,
        should_texture: true,
        should_remesh: true,
        ai_model: 'latest',
        topology: 'quad',
        target_polycount: 30000,
      }),
    });

    if (!taskRes.ok) {
      const errText = await taskRes.text();
      throw new Error(`Meshy task creation failed: ${errText}`);
    }

    const taskJson: unknown = await taskRes.json();
    if (
      typeof taskJson !== 'object' ||
      taskJson === null ||
      !('result' in taskJson) ||
      typeof (taskJson as MeshyCreateResponse).result !== 'string'
    ) {
      throw new Error('Meshy task creation returned unexpected payload');
    }
    const taskId = (taskJson as MeshyCreateResponse).result;

    const startTime = Date.now();
    let glbUrl: string | null = null;

    while (Date.now() - startTime < 180_000) {
      await new Promise((r) => setTimeout(r, 5000));

      const pollRes = await fetch(`${MESHY_API_BASE}/image-to-3d/${taskId}`, {
        headers: { Authorization: `Bearer ${meshyKey}` },
      });

      if (!pollRes.ok) continue;

      const pollJson: unknown = await pollRes.json();
      if (typeof pollJson !== 'object' || pollJson === null) continue;
      const pollData = pollJson as MeshyTaskResponse;

      if (pollData.status === 'SUCCEEDED' && pollData.model_urls?.glb) {
        glbUrl = pollData.model_urls.glb;
        break;
      }
      if (pollData.status === 'FAILED') {
        throw new Error('Meshy generation failed');
      }
    }

    if (!glbUrl) {
      throw new Error('Meshy generation timed out');
    }

    const { error: upsertError } = await supabase.from('clothing_assets').upsert(
      {
        product_id,
        product_image_url,
        glb_url: glbUrl,
        category,
      },
      { onConflict: 'product_id' }
    );

    if (upsertError) {
      console.error('[/api/clothing] Supabase upsert:', upsertError.message);
    }

    return NextResponse.json({ glb_url: glbUrl, cached: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/clothing]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
