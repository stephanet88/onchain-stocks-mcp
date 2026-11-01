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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// tokens.xyz sends no Retry-After, its docs ask for exponential backoff with jitter
export async function getJson<T>(
  url: string,
  headers: Record<string, string> = {},
  fetchImpl: Fetch = fetch,
  maxRetries = 4,
  baseDelayMs = 250,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetchImpl(url, { headers: { accept: "application/json", ...headers } });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) throw new HttpError(url, res.status, await res.text());
    await sleep(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 150));
  }
}
