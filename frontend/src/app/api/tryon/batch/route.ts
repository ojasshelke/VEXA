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
    const { user_id, user_photo_url, products } = body;

    if (!user_id || !user_photo_url || !products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });

    const results = [];

    for (const product of products) {
      const { product_id, product_image_url } = product;

      // 1. Check cache
      const { data: cached } = await supabase
        .from('tryon_results')
        .select('result_url')
        .eq('user_id', user_id)
        .eq('product_id', product_id)
        .single();

      if (cached?.result_url) {
        results.push({ product_id, result_url: cached.result_url, cached: true });
        continue;
      }

      // 2. Not cached: Call our own tryon API to reuse logic (via direct fetch if we can, 
      // but NextJS absolute fetch to itself during request is tricky. 
      // Let's replicate core HF call here to avoid self-fetch complexities.
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
              human_img: user_photo_url,
              garm_img: product_image_url
            }
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HF API failed: ${response.status} - ${text}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const fileName = `tryon_${user_id}_${product_id}_${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(`tryons/${fileName}`, arrayBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (uploadError) throw new Error(`Storage error: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(`tryons/${fileName}`);

        const result_url = publicUrlData.publicUrl;

        await supabase.from('tryon_results').insert({
          user_id,
          product_id,
          product_image_url,
          result_url,
          fit_label: 'AI Gen Fit',
          recommended_size: 'Standard'
        });

        results.push({ product_id, result_url, cached: false });
      } catch (e: unknown) {
        const err = e as Error;
        console.error(`Batch tryon failed for ${product_id}:`, err);
        // Skip or push error
        // Let's not fail the whole batch, just skip this product or push null
      }
    }

    return NextResponse.json(results, { status: 200 });

  } catch (error: unknown) {
    const err = error as Error;
    console.error("[/api/tryon/batch] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
