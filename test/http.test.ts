import { test } from "node:test";
import assert from "node:assert/strict";
import { getJson, HttpError, type Fetch } from "../src/http.ts";

function fakeFetch(statuses: number[]): { fetch: Fetch; calls: () => number } {
  let n = 0;
  const fetch = (async () => {
    const status = statuses[Math.min(n, statuses.length - 1)]!;
    n += 1;
    return new Response(status === 200 ? '{"ok":true}' : "nope", { status });
  }) as Fetch;
  return { fetch, calls: () => n };
}

test("retries 429 and 5xx, then succeeds", async () => {
  const f = fakeFetch([429, 503, 200]);
  assert.deepEqual(await getJson("https://x", {}, f.fetch), { ok: true });
  assert.equal(f.calls(), 3);
});

test("does not retry a 4xx other than 429", async () => {
  const f = fakeFetch([404]);
  await assert.rejects(getJson("https://x", {}, f.fetch), (err) => err instanceof HttpError && err.status === 404);
  assert.equal(f.calls(), 1);
});

test("gives up after the retry budget", async () => {
  const f = fakeFetch([429]);
  await assert.rejects(getJson("https://x", {}, f.fetch, 2), HttpError);
  assert.equal(f.calls(), 3);
});
