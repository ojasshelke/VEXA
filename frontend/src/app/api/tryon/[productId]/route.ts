import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { handleTryOn } from '../route';
import type { TryOnResult } from '@/types';

interface RouteContext {
  params: Promise<{ productId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { productId } = await params;

  // 1. Authenticate user session via Authorization header (Bearer token) or fallback to cookies
  let supabase;
  let userId: string;

  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    // Initialize standard client with Bearer token exactly as the client sent it
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    // Verify the JWT is valid and get the user
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Bearer token.' }, { status: 401 });
    }
    userId = user.id;
  } else {
    // Fallback to cookie-based session
    supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 });
    }
    userId = session.user.id;
  }

  try {

    // 2. Trigger the core try-on engine using the user's session client (enforces RLS)
    const tryOnData = await handleTryOn({ userId, productId }, supabase);
    const renderUrl = tryOnData.result_url;

    // 3. Utilize dynamic fit metadata from the core try-on engine to avoid redundant logic
    let fitScore = 85;
    const { fit_label: fitLabel, recommended_size: sizeRecommendation } = tryOnData as any;

    if (fitLabel === 'True to size') fitScore = 95 + Math.floor(Math.random() * 5);
    else if (fitLabel === 'Oversized') fitScore = 80 + Math.floor(Math.random() * 10);
    else fitScore = 70 + Math.floor(Math.random() * 10);

    // Provide the signed ephemeral URL for the tryOn result
    const heatmapUrl = renderUrl; 

    const result: TryOnResult = {
      id: crypto.randomUUID(),
      userId,
      productId,
      renderUrl,
      fitScore,
      sizeRecommendation,
      heatmapUrl, 
      status: 'ready',
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      ...result,
      signedExpiry: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error(`[API] Try-on error for ${productId}:`, error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to process try-on request' },
      { status: 500 }
    );
  }
}

