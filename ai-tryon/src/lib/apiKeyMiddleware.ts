import type { MarketplaceContext } from '@/types'
export async function validateApiKey(key: string): Promise<MarketplaceContext | null> {
  // TODO: check key against Supabase api_keys table
  return null
}
export async function logApiUsage(
  apiKeyId: string,
  endpoint: string,
  statusCode: number
): Promise<void> {
  // TODO: insert into usage_logs table
}
