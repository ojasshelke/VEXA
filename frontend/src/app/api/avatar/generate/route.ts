import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireApiKey } from '@/lib/apiKeyMiddleware';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { ctx, error: authError } = await requireApiKey(req);
    if (authError) return authError;

    const body = await req.json();
    const { userId, photoUrl, photoBase64, measurements } = body;

    const parsedPhoto = photoUrl || photoBase64;
    
    if (!userId || !parsedPhoto || !measurements) {
      return NextResponse.json({ error: 'Missing required fields: userId, photoUrl, or measurements' }, { status: 400 });
    }

    const pyServiceUrl = process.env.AVATAR_SERVICE_URL;
    if (!pyServiceUrl) {
      return NextResponse.json({ error: 'AVATAR_SERVICE_URL not configured' }, { status: 500 });
    }

    // Call Python FastAPI
    const pyRes = await fetch(`${pyServiceUrl}/generate-avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_url: parsedPhoto, measurements })
    });

    if (!pyRes.ok) {
      const errTxt = await pyRes.text();
      throw new Error(`Python service failed: ${errTxt}`);
    }

    const data = await pyRes.json();
    if (!data.avatar_url) {
      throw new Error("No avatar_url returned from Python service");
    }

    // Save to Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase internal config missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const { error: dbError } = await supabase
      .from('users')
      .update({ avatar_url: data.avatar_url })
      .eq('id', userId);

    if (dbError) {
       console.warn("Failed to update avatar_url linking:", dbError.message);
    }

    return NextResponse.json({ avatarUrl: data.avatar_url, status: 'success' });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[/api/avatar/generate]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
