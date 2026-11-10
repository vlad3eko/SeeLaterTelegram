/** True for an API answer that says "too many requests / quota used up". */
export function isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: unknown } | undefined)?.status;

    return status === 429 || /\b429\b|rate.?limit|RESOURCE_EXHAUSTED|quota/iu.test(message);
}
