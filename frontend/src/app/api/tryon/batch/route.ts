import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isRateLimited } from '@/lib/rateLimit';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (await isRateLimited(ip, 10)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { userId, userPhotoUrl, products } = body;

    if (!userId || !userPhotoUrl || !products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });

    const results = [];

    for (const product of products) {
      const { productId, productImageUrl } = product;

      // 1. Check cache
      const { data: cached } = await supabase
        .from('tryon_results')
        .select('result_url')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .single();

      if (cached?.result_url) {
        // Sign the cached path
        const { data: signedData } = await supabase.storage
          .from('avatars')
          .createSignedUrl(cached.result_url, 3600);
        
        if (signedData?.signedUrl) {
          results.push({ productId, resultUrl: signedData.signedUrl, cached: true });
          continue;
        }
      }

      try {
        const hfKey = process.env.HUGGINGFACE_API_KEY;
        if (!hfKey) throw new Error("Missing HUGGINGFACE_API_KEY");

        const response = await fetch("https://api-inference.huggingface.co/models/yisol/IDM-VTON", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${hfKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: {
              human_img: userPhotoUrl,
              garm_img: productImageUrl
            }
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HF API failed: ${response.status} - ${text}`);
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

        if (uploadError) throw new Error(`Storage error: ${uploadError.message}`);

        // Sign the new result
        const { data: signedData } = await supabase.storage
          .from('avatars')
          .createSignedUrl(storagePath, 3600);

        const resultUrl = signedData?.signedUrl ?? '';

        await supabase.from('tryon_results').insert({
          user_id: userId,
          product_id: productId,
          product_image_url: productImageUrl,
          result_url: storagePath, // Store path, not URL
          fit_label: 'True to size',
          recommended_size: 'M'
        });

        results.push({ productId, resultUrl, cached: false });
      } catch (e: unknown) {
        const err = e as Error;
        console.error(`Batch tryon failed for ${productId}:`, err);
      }
    }

    return NextResponse.json(results, { status: 200 });

  } catch (error: unknown) {
    const err = error as Error;
    console.error("[/api/tryon/batch] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
