export async function callFashnAI(
  personImageUrl: string,
  garmentImageUrl: string
): Promise<{ jobId: string }> {
  // TODO: POST to Fashn.ai API
  throw new Error('Not implemented')
}
export async function pollFashnResult(
  jobId: string
): Promise<{ status: string; resultUrl?: string }> {
  // TODO: GET Fashn.ai job status
  throw new Error('Not implemented')
}
