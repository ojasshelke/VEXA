import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isRateLimited } from '@/lib/rateLimit';
import { requireApiKey } from '@/lib/apiKeyMiddleware';
import type { TryOnRequest } from '@/types';

// CSRF & SSRF Safety: Only allow files from VEXA's official storage bucket
const ALLOWED_STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_URL;

function validateSecureUrl(url: string, description: string): string {
  if (!url) return url;
  if (ALLOWED_STORAGE_BUCKET && !url.startsWith(ALLOWED_STORAGE_BUCKET)) {
    console.error(`[Security Warning] Blocked potential SSRF attempt. ${description} URL points to untrusted domain: ${url}`);
    throw new Error(`Security Violation: The provided ${description} asset is not from an authorized source.`);
  }
  return url;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (isRateLimited(ip, 10)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
  }

  // 1. Authenticate Request
  // Check for specialized Marketplace API Key first
  const { error: authError } = await requireApiKey(req);
  
  // If no API Key, check for User Session (for internal frontend calls)
  let sessionUser: any = null;
  if (authError) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Valid Session or API Key required.' }, { status: 401 });
    }
    sessionUser = session.user;
  }

  try {
    const body: TryOnRequest = await req.json();
    
    // Identity Enforcement: User cannot trigger try-ons for others unless they have a service API Key
    if (sessionUser && sessionUser.id !== body.userId) {
      return NextResponse.json({ error: 'Forbidden: You can only initiate try-ons for your own account.' }, { status: 403 });
    }

    // Initialize Service Client for the core logic (handling DB writes to protected tables)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const serviceClient = createClient(supabaseUrl, supabaseKey);

    const result = await handleTryOn(body, serviceClient);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[/api/tryon] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Shared logic for initiating a try-on process.
 */
export async function handleTryOn(body: TryOnRequest, supabase: SupabaseClient) {
  const { userId, productId } = body;

  if (!userId || !productId) {
    throw new Error('Missing required fields: userId and productId are required.');
  }

  // 1. Resolve Avatar URL (Fixes: Stored SSRF)
  const { data: user } = await supabase
    .from('users')
    .select('avatar_url')
    .eq('id', userId)
    .single();

  const rawAvatarUrl = user?.avatar_url || `${ALLOWED_STORAGE_BUCKET}/storage/v1/object/public/models/rp-character/model.glb`;
  const avatarUrl = validateSecureUrl(rawAvatarUrl, 'Avatar');

  // 2. Resolve Clothing URL (Fixes: Stored SSRF)
  const { data: asset } = await supabase
    .from('clothing_assets')
    .select('glb_url, product_image_url')
    .eq('product_id', productId)
    .single();

  if (!asset?.glb_url) {
    throw new Error(`Asset Validation: No verified 3D assets found for product ID ${productId}.`);
  }

  const clothingUrl = validateSecureUrl(asset.glb_url, 'Clothing Asset');
  const productImageUrl = asset.product_image_url;

  // 3. Check cache
  const { data: cached } = await supabase
    .from('tryon_results')
    .select('result_url')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single();
  
  if (cached?.result_url) {
    return { result_url: cached.result_url, cached: true };
  }

  // 4. API Logic
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) throw new Error("Internal Config Error: Missing Inference Key");

  const response = await fetch("https://api-inference.huggingface.co/models/yisol/IDM-VTON", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${hfKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: { human_img: avatarUrl, garm_img: clothingUrl }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Inference Engine Failure: ${response.status} - ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const fileName = `tryon_${userId}_${productId}_${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(`tryons/${fileName}`, arrayBuffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (uploadError) throw new Error(`Asset Storage Error: ${uploadError.message}`);

  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(`tryons/${fileName}`);
  
  const result_url = publicUrlData.publicUrl;

  // 5. Audit Log / Results
  const { error: insertError } = await supabase
    .from('tryon_results')
    .insert({
       user_id: userId,
       product_id: productId,
       product_image_url: productImageUrl,
       result_url,
       fit_label: 'AI Gen Fit',
       recommended_size: 'Standard'
    });
    
  if (insertError) console.error("[/api/tryon] DB Sync Error:", insertError);

  return { result_url, cached: false };
}
