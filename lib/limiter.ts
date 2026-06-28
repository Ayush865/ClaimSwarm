// Token-bucket rate limiter for Groq API calls.
// Tracks a rolling 60s window for RPM; respects retry-after on 429.

const RPM = Number(process.env.GROQ_RPM ?? 30);
const TPM = Number(process.env.GROQ_TPM ?? 6000);

const requestTimestamps: number[] = [];
let pendingTokens = 0;

function windowStart() {
  return Date.now() - 60_000;
}

function requestsInWindow() {
  const cutoff = windowStart();
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length;
}

async function waitForSlot() {
  while (requestsInWindow() >= RPM) {
    const oldest = requestTimestamps[0];
    const waitMs = oldest - windowStart() + 100;
    await sleep(waitMs > 0 ? waitMs : 500);
  }
  while (pendingTokens >= TPM) {
    await sleep(1000);
  }
}

export async function withRateLimit<T>(
  estimatedTokens: number,
  fn: () => Promise<T>
): Promise<T> {
  await waitForSlot();
  requestTimestamps.push(Date.now());
  pendingTokens += estimatedTokens;

  try {
    return await fn();
  } finally {
    // tokens will be freed after 60s naturally; decrement optimistically after call
    setTimeout(() => {
      pendingTokens = Math.max(0, pendingTokens - estimatedTokens);
    }, 5000);
  }
}

export async function handleRetryAfter(retryAfterHeader: string | null) {
  if (!retryAfterHeader) return;
  const secs = parseFloat(retryAfterHeader);
  if (!isNaN(secs)) {
    await sleep((secs + 0.5) * 1000);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
