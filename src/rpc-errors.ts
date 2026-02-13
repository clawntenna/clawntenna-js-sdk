/**
 * Classify common RPC errors into human-readable hints.
 * Returns an enhanced message string, or null if the error is unrecognized.
 */
export function classifyRpcError(
  err: Error,
  ctx: { method: string; chainName: string }
): string | null {
  const msg = err.message ?? '';

  if (msg.includes('BAD_DATA') || msg.includes('could not decode result data')) {
    return `${ctx.method} failed: contract may not be deployed on ${ctx.chainName}, or the RPC returned an empty response. Check that the correct chain and RPC URL are configured.`;
  }

  if (
    msg.includes('NETWORK_ERROR') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('fetch failed') ||
    msg.includes('getaddrinfo')
  ) {
    return `${ctx.method} failed: network error connecting to ${ctx.chainName} RPC. Check your RPC URL and network connectivity.`;
  }

  if (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('exceeded') ||
    msg.includes('throttl')
  ) {
    return `${ctx.method} failed: RPC rate limit hit on ${ctx.chainName}. The request was retried but the limit persists. Try again later or use a different RPC endpoint.`;
  }

  return null;
}
