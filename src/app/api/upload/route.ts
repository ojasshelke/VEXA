/**
 * POST /api/upload
 * Accepts a multipart form-data image upload.
 * Uploads to Supabase Storage bucket 'avatars' and returns the public URL.
 * Also updates the user's avatar_url in the users table.
 *
 * Auth: expects Authorization: Bearer <access_token> header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase env vars are not configured');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate — extract user from Bearer token
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Authorization header is required' }, { status: 401 });
  }

  const supabase = getServerSupabase();

  // Verify token & get user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // 2. Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A "file" field is required in the form data' }, { status: 422 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are accepted' }, { status: 422 });
  }

  const maxBytes = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxBytes) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 });
  }

  // 3. Upload to Supabase Storage
  const ext = file.name.split('.').pop() ?? 'jpg';
  const storagePath = `avatars/${user.id}_${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? 'Storage upload failed' },
      { status: 500 }
    );
  }

  // 4. Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(storagePath);

  const avatarUrl = publicUrlData.publicUrl;

  // 5. Update users table (non-fatal)
  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (updateError) {
    console.warn('[/api/upload] avatar_url update failed:', updateError.message);
  }

  return NextResponse.json({ url: avatarUrl }, { status: 200 });
}
