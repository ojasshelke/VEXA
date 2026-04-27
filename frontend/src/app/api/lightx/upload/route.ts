/**
 * POST /api/lightx/upload
 * Decodes a base64 image and uploads it to Supabase Storage,
 * returning a public URL suitable for passing to the LightX API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UploadRequestBody {
  base64Image: string;
  userId: string;
  type: 'person' | 'garment';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth: require Bearer token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Bearer token required' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const token = authHeader.split(' ')[1];
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized: Invalid Bearer token' }, { status: 401 });
  }

  let body: Partial<UploadRequestBody>;
  try {
    body = (await req.json()) as Partial<UploadRequestBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { base64Image, userId, type } = body;

  if (!base64Image) {
    return NextResponse.json({ error: 'base64Image is required' }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  if (!type || (type !== 'person' && type !== 'garment')) {
    return NextResponse.json({ error: 'type must be "person" or "garment"' }, { status: 400 });
  }
  if (userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden: userId does not match token' }, { status: 403 });
  }

  // Strip optional data URI prefix
  const base64Data = base64Image.startsWith('data:')
    ? base64Image.split(',')[1] ?? base64Image
    : base64Image;

  if (!base64Data) {
    return NextResponse.json({ error: 'base64Image is empty after stripping prefix' }, { status: 400 });
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(base64Data, 'base64');
  } catch {
    return NextResponse.json({ error: 'base64Image is not valid base64' }, { status: 400 });
  }

  const storagePath = `${userId}/${Date.now()}-${type}.jpg`;
  const bucket = 'tryon-inputs';

  const serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey ?? supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { error: uploadError } = await serviceClient.storage
    .from(bucket)
    .upload(storagePath, imageBuffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    console.error('[LightX/upload] Supabase upload failed:', uploadError.message);
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = serviceClient.storage.from(bucket).getPublicUrl(storagePath);

  if (!urlData?.publicUrl) {
    return NextResponse.json({ error: 'Could not retrieve public URL after upload' }, { status: 500 });
  }

  console.log(`[LightX/upload] Uploaded ${type} for user ${userId} → ${urlData.publicUrl.slice(0, 80)}…`);
  return NextResponse.json({ publicUrl: urlData.publicUrl }, { status: 200 });
}
