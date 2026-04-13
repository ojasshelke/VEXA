import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { isRateLimited } from '@/lib/rateLimit';
import type { TryOnRequest } from '@/types';

// CSRF & SSRF Safety: Only allow files from VEXA's official storage bucket
const ALLOWED_STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_URL;

function validateSecureUrl(url: string, description: string): string {
  if (!url) return url;
  if (ALLOWED_STORAGE_BUCKET) {
    try {
      const parsedUrl = new URL(url);
      const allowedOrigin = new URL(ALLOWED_STORAGE_BUCKET).origin;
      if (parsedUrl.origin !== allowedOrigin) {
        throw new Error('Origin mismatch');
      }
    } catch (error) {
      console.error(`[Security Warning] Blocked potential SSRF attempt. ${description} URL points to untrusted domain: ${url}`);
      throw new Error(`Security Violation: The provided ${description} asset is not from an authorized source.`);
    }
  }
  return url;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (isRateLimited(ip, 10)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
  }

  // 1. Authenticate Request via User Session
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized: Valid Session required.' }, { status: 401 });
  }
  const sessionUser = session.user;

  try {
    const body: TryOnRequest = await req.json();
    
    // Identity Enforcement: User cannot trigger try-ons for others
    if (sessionUser.id !== body.userId) {
      return NextResponse.json({ error: 'Forbidden: You can only initiate try-ons for your own account.' }, { status: 403 });
    }

    const result = await handleTryOn(body, supabase);
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
    .select('*')
    .eq('id', userId)
    .single();

  if (!user?.avatar_url) {
    throw new Error(`Profile Validation: User ${userId} does not have a registered 3D avatar.`);
  }

  const rawAvatarUrl = user.avatar_url;
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
    .select('result_url, fit_label, recommended_size')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single();
  
  if (cached?.result_url) {
    const { data: signedData } = await supabase.storage.from('avatars').createSignedUrl(cached.result_url, 3600);
    return { 
      result_url: signedData?.signedUrl || cached.result_url, 
      path: cached.result_url,
      cached: true,
      fit_label: cached.fit_label,
      recommended_size: cached.recommended_size
    };
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

  const storagePath = `tryons/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(storagePath, arrayBuffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (uploadError) throw new Error(`Asset Storage Error: ${uploadError.message}`);

  // Create ephemeral signed URL instead of permanent public URL (Fixes Privacy Risk)
  const { data: signedData } = await supabase.storage
    .from('avatars')
    .createSignedUrl(storagePath, 3600);
  
  const result_url = signedData?.signedUrl || '';

  // 5. Generate actual fit metadata
  let fit_label = 'True to size';
  let recommended_size = 'M';
  
  const { data: sizeChart } = await supabase
    .from('size_charts')
    .select('*')
    .eq('product_id', productId);
    
  if (user && sizeChart) {
    const { getFitRecommendation } = await import('@/lib/fitEngine');
    const recommendation = getFitRecommendation(user, sizeChart);
    fit_label = recommendation.fitLabel;
    recommended_size = recommendation.recommendedSize;
  }

  // 6. Audit Log / Results
  const { error: insertError } = await supabase
    .from('tryon_results')
    .insert({
       user_id: userId,
       product_id: productId,
       product_image_url: productImageUrl,
       result_url: storagePath, // Store secured path for generating future signed UI rendering
       fit_label,
       recommended_size
    });
    
  if (insertError) console.error("[/api/tryon] DB Sync Error:", insertError);

  return { result_url, path: storagePath, cached: false, fit_label, recommended_size };
}
