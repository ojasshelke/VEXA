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
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });

    const results = [];
    let targetPhotoUrl = userPhotoUrl;

    // Handle base64 data URL at the start of the batch
    if (userPhotoUrl.startsWith('data:')) {
      try {
        const base64Data = userPhotoUrl.split(',')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          const fileName = `batch_base64_${userId}_${Date.now()}.png`;
          const storagePath = `uploads/${fileName}`;

          await supabase.storage
            .from('avatars')
            .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });

          const { data: signedData } = await supabase.storage
            .from('avatars')
            .createSignedUrl(storagePath, 3600);
          
          if (signedData?.signedUrl) targetPhotoUrl = signedData.signedUrl;
        }
      } catch (e) {
        console.error('[/api/tryon/batch] Data URL conversion failed:', e);
      }
    }

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

        const SPACE_URL = 'https://yisol-idm-vton.hf.space';
        const authHeaders = { Authorization: `Bearer ${hfKey}` };

        // Upload images to the HF Space first
        async function uploadToSpace(imageUrl: string, filename: string): Promise<string> {
          const imgRes = await fetch(imageUrl);
          if (!imgRes.ok) throw new Error(`Failed to download: ${imageUrl}`);
          const imgBuffer = await imgRes.arrayBuffer();
          const blob = new Blob([imgBuffer], { type: 'image/jpeg' });
          const formData = new FormData();
          formData.append('files', blob, filename);
          const uploadRes = await fetch(`${SPACE_URL}/upload`, {
            method: 'POST', headers: authHeaders, body: formData,
          });
          if (!uploadRes.ok) throw new Error(`Space upload failed: ${uploadRes.status}`);
          const paths = await uploadRes.json();
          return paths[0];
        }

        const humanPath = await uploadToSpace(targetPhotoUrl, `human_${Date.now()}.jpg`);
        const garmPath = await uploadToSpace(productImageUrl, `garment_${Date.now()}.jpg`);

        const sessionHash = Math.random().toString(36).substring(2, 15);

        const joinRes = await fetch(`${SPACE_URL}/queue/join`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [
              { 
                background: { path: humanPath, meta: { _type: "gradio.FileData" } },
                layers: [],
                composite: null,
              },
              { path: garmPath, meta: { _type: "gradio.FileData" } },
              "Garment",
              true,
              true,
              30,
              42,
            ],
            fn_index: 0,
            session_hash: sessionHash,
          })
        });

        if (!joinRes.ok) {
          const text = await joinRes.text();
          throw new Error(`Failed to join AI queue: ${joinRes.status} - ${text}`);
        }

        // Poll for results via SSE
        const dataRes = await fetch(`${SPACE_URL}/queue/data?session_hash=${sessionHash}`, {
          headers: authHeaders,
        });

        if (!dataRes.ok) throw new Error(`Failed to connect to AI result stream`);

        const sseText = await dataRes.text();
        let resultData: any = null;
        for (const line of sseText.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.msg === 'process_completed' && parsed.output?.data) {
                resultData = parsed.output.data;
                break;
              }
            } catch { /* skip */ }
          }
        }

        if (!resultData?.[0]) throw new Error("No result from AI engine");

        const firstResult = resultData[0];
        let resultTmpUrl: string | null = null;
        if (typeof firstResult === 'string') {
          resultTmpUrl = firstResult.startsWith('http') ? firstResult : `${SPACE_URL}/file=${firstResult}`;
        } else if (firstResult?.url) {
          resultTmpUrl = firstResult.url;
        } else if (firstResult?.path) {
          resultTmpUrl = `${SPACE_URL}/file=${firstResult.path}`;
        }

        if (!resultTmpUrl) throw new Error("No result URL from AI engine");

        const resultImgRes = await fetch(resultTmpUrl, { headers: authHeaders });
        if (!resultImgRes.ok) throw new Error("Failed to download generated image");
        const arrayBuffer = await resultImgRes.arrayBuffer();
        
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
