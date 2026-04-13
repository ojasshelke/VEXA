import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isRateLimited } from '@/lib/rateLimit';
import { requireApiKey } from '@/lib/apiKeyMiddleware';
import type { TryOnRequest } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (isRateLimited(ip, 10)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
  }

  // 1. Authenticate via VEXA API key (Fixes: Security review)
  const { error: authError } = await requireApiKey(req);
  if (authError) return authError;

  try {
    const body: TryOnRequest = await req.json();
    const result = await handleTryOn(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[/api/tryon] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Shared logic for initiating a try-on process.
 * Can be called internally by other API routes to avoid HTTP anti-patterns.
 */
export async function handleTryOn(body: TryOnRequest, token?: string) {
  const { userId, productId } = body;

  if (!userId || !productId) {
    throw new Error('Missing required fields: userId and productId are required for canonical asset resolution.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Critical Configuration Error: Supabase logic requires SERVICE_ROLE_KEY for server-side operations.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { 
    auth: { persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  });

  // 1. Resolve Avatar URL from official records (Fixes: SSRF & Identity Review)
  const { data: user } = await supabase
    .from('users')
    .select('avatar_url')
    .eq('id', userId)
    .single();

  const avatarUrl = user?.avatar_url || 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/rp-character/model.glb';

  // 2. Resolve Clothing URL from official records (Fixes: SSRF Review)
  // We NEVER trust URLs provided directly from the client.
  const { data: asset } = await supabase
    .from('clothing_assets')
    .select('glb_url, product_image_url')
    .eq('product_id', productId)
    .single();

  if (!asset?.glb_url) {
    throw new Error(`SSRF Prevention: No verified 3D assets found for product ID ${productId}.`);
  }

  const clothingUrl = asset.glb_url;
  const productImageUrl = asset.product_image_url;

  // 3. Check cache in tryon_results
  const { data: cached } = await supabase
    .from('tryon_results')
    .select('result_url')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single();
  
  if (cached?.result_url) {
    return { result_url: cached.result_url, cached: true };
  }

  // 4. No cache: Call Hugging Face API
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) {
    throw new Error("Missing HUGGINGFACE_API_KEY environment variable");
  }

  const response = await fetch("https://api-inference.huggingface.co/models/yisol/IDM-VTON", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${hfKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: {
        human_img: avatarUrl,
        garm_img: clothingUrl
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hugging Face API failed: ${response.status} - ${text}`);
  }

  // Assumes Hugging Face returns an image directly
  const arrayBuffer = await response.arrayBuffer();
  
  const fileName = `tryon_${userId}_${productId}_${Date.now()}.png`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(`tryons/${fileName}`, arrayBuffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(`tryons/${fileName}`);
  
  const result_url = publicUrlData.publicUrl;

  // 5. Save to tryon_results table
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
    
  if (insertError) {
     console.error("[/api/tryon] DB Insert Error:", insertError);
  }

  return { result_url, cached: false };
}
