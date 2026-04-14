import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFitRecommendation } from '@/lib/fitEngine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, productId } = body;

    if (!userId || !productId) {
      return NextResponse.json({ error: 'Missing userId or productId' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing Supabase API keys' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Fetch user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch size chart
    const { data: sizeChart, error: sizeError } = await supabase
      .from('size_charts')
      .select('*')
      .eq('product_id', productId);

    if (sizeError) {
      console.error("[/api/size] Error fetching size chart:", sizeError.message);
    }

    const { fitLabel, recommendedSize } = getFitRecommendation(user, sizeChart || []);

    return NextResponse.json({ fitLabel, recommendedSize }, { status: 200 });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[/api/size] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
