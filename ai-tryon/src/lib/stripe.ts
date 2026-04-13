export async function createCheckoutSession(
  marketplaceName: string,
  tier: 'starter' | 'growth' | 'enterprise'
): Promise<{ url: string }> {
  // TODO: Stripe checkout session
  throw new Error('Not implemented')
}
