import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { marketplace_name, monthly_limit } = body;

    if (!marketplace_name) {
      return NextResponse.json({ error: 'Missing marketplace_name' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const newKey = `vexa_${crypto.randomUUID()}`;

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        marketplace_name: marketplace_name,
        key: newKey,
        monthly_limit: monthly_limit || 10000,
        requests_count: 0,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error("[/api/keys/generate] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

