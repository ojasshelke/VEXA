import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isRateLimited } from '@/lib/rateLimit';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (isRateLimited(ip, 10)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
  }

  try {
    const body = await req.json();
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
export async function handleTryOn(body: any) {
  const { user_id, user_photo_url, product_image_url, product_id } = body;

  if (!user_id || !user_photo_url || !product_image_url || !product_id) {
    throw new Error('Missing required fields');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables are missing');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // 1. Check cache in tryon_results
  const { data: cached } = await supabase
    .from('tryon_results')
    .select('result_url')
    .eq('user_id', user_id)
    .eq('product_id', product_id)
    .single();
  
  if (cached?.result_url) {
    return { result_url: cached.result_url, cached: true };
  }

  // 2. No cache: Call Hugging Face API
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
        human_img: user_photo_url,
        garm_img: product_image_url
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hugging Face API failed: ${response.status} - ${text}`);
  }

  // Assumes Hugging Face returns an image directly
  const arrayBuffer = await response.arrayBuffer();
  
  const fileName = `tryon_${user_id}_${product_id}_${Date.now()}.png`;

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

  // 3. Save to tryon_results table
  const { error: insertError } = await supabase
    .from('tryon_results')
    .insert({
       user_id,
       product_id,
       product_image_url,
       result_url,
       fit_label: 'AI Gen Fit',
       recommended_size: 'Standard'
    });
    
  if (insertError) {
     console.error("[/api/tryon] DB Insert Error:", insertError);
  }

  return { result_url, cached: false };
}
