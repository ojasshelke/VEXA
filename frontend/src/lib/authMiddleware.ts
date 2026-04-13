import { NextRequest, NextResponse } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';

/**
 * Validates the Authorization: Bearer <token> header and returns the Supabase User.
 */
export async function validateUser(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Auth] Supabase environment variables missing');
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    if (error) console.error('[Auth] Token validation error:', error.message);
    return null;
  }

  return user;
}

/**
 * Unified response for requiring authentication in route handlers.
 */
export async function requireAuth(req: NextRequest): Promise<{ user: User; error: null } | { user: null; error: NextResponse }> {
  const user = await validateUser(req);
  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Unauthorized — valid user session required' },
        { status: 401 }
      ),
    };
  }
  return { user, error: null };
}
