import { setTimeout as sleep } from "node:timers/promises";

export type Fetch = typeof fetch;

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(url: string, status: number, body: string) {
    super(`${status} from ${url}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

// the whole tool call ran out of time: in-flight requests and pending retries are cancelled
export class DeadlineError extends Error {
  constructor() {
    super("tool time limit reached");
    this.name = "DeadlineError";
  }
}

export interface GetOptions {
  headers?: Record<string, string>;
  fetchImpl?: Fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  // the caller's deadline: aborts the request and any backoff wait
  signal?: AbortSignal;
}

// tokens.xyz sends no Retry-After, its docs ask for exponential backoff with jitter
export async function getJson<T>(url: string, options: GetOptions = {}): Promise<T> {
  const { headers = {}, fetchImpl = fetch, maxRetries = 4, baseDelayMs = 250, timeoutMs = 10_000, signal } = options;
  for (let attempt = 0; ; attempt += 1) {
    // a hung upstream must not hang the caller's tool call; a timeout is not retried
    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await fetchImpl(url, { headers: { accept: "application/json", ...headers }, signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) throw new HttpError(url, res.status, await res.text());
    // timers/promises rejects with a generic AbortError; surface the caller's reason (the deadline) instead
    await sleep(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 150), undefined, { signal }).catch((err: unknown) => {
      throw signal?.aborted ? signal.reason : err;
    });
  }
}

// one label per failure cause, so a 429 is never shown as a missing route or a crash
export function describeError(err: unknown): string {
  if (err instanceof DeadlineError) return err.message;
  if (err instanceof Error && err.name === "TimeoutError") return "timed out";
  if (err instanceof HttpError) {
    if (err.status === 429) return "rate limited";
    if (/route/i.test(err.body)) return "no route";
    return `upstream error ${err.status}`;
  }
  return `failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`;
}
