/**
 * LightX Virtual Try-On API client.
 * Drop-in alternative to fashn.ts — used when TRYON_PROVIDER=lightx.
 */

const LIGHTX_TRYON_URL = 'https://api.lightxeditor.com/external/api/v2/aivirtualtryon';
const LIGHTX_STATUS_URL = 'https://api.lightxeditor.com/external/api/v2/order-status';

export async function callLightxAI(
  personImageUrl: string,
  garmentImageUrl: string,
  _category: 'tops' | 'bottoms' | 'one-pieces' = 'tops'
): Promise<{ orderId: string }> {
  const apiKey = process.env.LIGHTX_API_KEY;
  if (!apiKey) throw new Error('LIGHTX_API_KEY is not configured');

  const response = await fetch(LIGHTX_TRYON_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      imageUrl: personImageUrl,
      styleImageUrl: garmentImageUrl,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LightX try-on submit failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const body = data.body ?? data;
  if (!body.orderId) {
    throw new Error('LightX did not return an orderId');
  }

  return { orderId: body.orderId };
}

export async function pollLightxResult(
  orderId: string
): Promise<{ status: string; resultUrl?: string; error?: string }> {
  const apiKey = process.env.LIGHTX_API_KEY;
  if (!apiKey) throw new Error('LIGHTX_API_KEY is not configured');

  const response = await fetch(LIGHTX_STATUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ orderId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LightX status poll failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const body = data.body ?? data;

  if (body.status === 'active' || body.status === 'completed') {
    return {
      status: 'completed',
      resultUrl: body.output ?? undefined,
    };
  }

  if (body.status === 'failed') {
    return {
      status: 'failed',
      error: body.error || 'Unknown LightX error',
    };
  }

  // 'init' or 'pending' — still processing
  return { status: body.status || 'processing' };
}
