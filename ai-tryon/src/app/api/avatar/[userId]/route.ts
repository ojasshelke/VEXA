import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    console.log('[avatar/userId] Fetching avatar for:', userId);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // If no service role key, return placeholder
    if (!supabaseServiceKey || !supabaseUrl) {
      console.warn('[avatar/userId] No SUPABASE_SERVICE_ROLE_KEY — returning placeholder');
      return NextResponse.json({
        user_id: userId,
        glb_url: '/models/avatar.glb',
        status: 'ready',
        archetype_ids: [],
        blend_weights: [],
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('avatars')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.log('[avatar/userId] No avatar found, returning placeholder');
      // If not found, return placeholder with ready status so viewer shows something
      return NextResponse.json({
        user_id: userId,
        glb_url: '/models/avatar.glb',
        status: 'ready',
        archetype_ids: [],
        blend_weights: [],
      });
    }

    console.log('[avatar/userId] Found avatar:', data.glb_url);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[avatar/userId] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
