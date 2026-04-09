import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> | { userId: string } }) {
  try {
    const params = await context.params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Missing config" }, { status: 500 });
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from('users').select('avatar_url').eq('id', params.userId).single();
    
    if (data?.avatar_url) {
      return NextResponse.json({ status: 'ready', glbUrl: data.avatar_url });
    }
    
    return NextResponse.json({ status: 'processing', progress: 50 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
  }
}

