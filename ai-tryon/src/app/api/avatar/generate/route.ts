import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/avatar/generate
 *
 * Generates a 3D avatar by forwarding to the Python backend service.
 * Accepts photo as base64 data URL or a regular URL.
 * Falls back to placeholder GLB if the backend is unreachable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, photoUrl, photoBase64, measurements } = body as {
      userId: string;
      photoUrl?: string;
      photoBase64?: string;
      measurements?: {
        height_cm?: number;
        height?: number;
        chest_cm?: number;
        chest?: number;
        waist_cm?: number;
        waist?: number;
        hips_cm?: number;
        hips?: number;
        inseam_cm?: number;
        inseam?: number;
        shoulder_cm?: number;
        shoulder_width?: number;
      };
    };

    console.log('[avatar/generate] Request:', { userId, hasPhotoUrl: !!photoUrl, hasPhotoBase64: !!photoBase64, hasMeasurements: !!measurements });

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Accept photo as either URL or base64
    const photo = photoUrl || photoBase64;
    if (!photo) {
      return NextResponse.json({ error: 'Missing photoUrl or photoBase64' }, { status: 400 });
    }

    // Normalize measurements to the format the Python backend expects
    const normalizedMeasurements = measurements ? {
      height: measurements.height_cm || measurements.height || 170,
      chest: measurements.chest_cm || measurements.chest || 90,
      waist: measurements.waist_cm || measurements.waist || 75,
      hips: measurements.hips_cm || measurements.hips || 95,
      inseam: measurements.inseam_cm || measurements.inseam || 80,
      shoulder_width: measurements.shoulder_cm || measurements.shoulder_width || 45,
    } : undefined;

    // 1. Try forwarding to Python backend
    const avatarServiceUrl = process.env.AVATAR_SERVICE_URL || 'http://localhost:8000';
    const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

    let avatarUrl: string | null = null;
    let archetypes: any[] = [];

    try {
      console.log('[avatar/generate] Forwarding to backend:', avatarServiceUrl);
      const pythonResponse = await fetch(`${avatarServiceUrl}/generate-avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${internalToken || ''}`,
        },
        body: JSON.stringify({
          photo_url: photo,
          measurements: normalizedMeasurements,
        }),
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      if (pythonResponse.ok) {
        const pythonData = await pythonResponse.json();
        avatarUrl = pythonData.avatar_url;
        archetypes = pythonData.archetypes || [];
        console.log('[avatar/generate] Backend returned:', avatarUrl);
      } else {
        const errText = await pythonResponse.text();
        console.warn('[avatar/generate] Backend error:', pythonResponse.status, errText);
      }
    } catch (backendErr: any) {
      console.warn('[avatar/generate] Backend unreachable:', backendErr.message);
    }

    // 2. Fallback to placeholder GLB
    if (!avatarUrl) {
      avatarUrl = '/models/avatar.glb';
      console.log('[avatar/generate] Using placeholder GLB:', avatarUrl);
    }

    // 3. Try to upsert in Supabase (optional — don't fail if no service role key)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (serviceRoleKey && supabaseUrl) {
      try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { error: dbError } = await supabase
          .from('avatars')
          .upsert({
            user_id: userId,
            glb_url: avatarUrl,
            status: 'ready',
            archetype_ids: archetypes.map?.((a: any) => a.name || a.id) || [],
            blend_weights: archetypes.map?.((a: any) => a.weight || 0) || [],
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (dbError) {
          console.error('[avatar/generate] DB upsert failed (non-fatal):', dbError);
        }
      } catch (dbErr) {
        console.error('[avatar/generate] DB error (non-fatal):', dbErr);
      }
    } else {
      console.warn('[avatar/generate] No SUPABASE_SERVICE_ROLE_KEY — skipping DB upsert');
    }

    // 4. Return result
    return NextResponse.json({
      avatarUrl,
      status: 'ready',
      archetypes,
    });

  } catch (error: any) {
    console.error('[avatar/generate] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
