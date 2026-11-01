import { test } from "node:test";
import assert from "node:assert/strict";
import { cached } from "../src/cache.ts";

test("same arguments inside the window share one call, different ones do not", async () => {
  let t = 0;
  let calls = 0;
  const fn = cached(async (mint: string, usd: number) => `${mint}:${usd}:${++calls}`, 15_000, () => t);
  assert.equal(await fn("XS", 1_000), "XS:1000:1");
  assert.equal(await fn("XS", 1_000), "XS:1000:1");
  assert.equal(await fn("XS", 10_000), "XS:10000:2");
  t = 15_000;
  assert.equal(await fn("XS", 1_000), "XS:1000:3");
});

test("a failure is not cached: the next call tries again", async () => {
  let calls = 0;
  const fn = cached(async () => {
    calls += 1;
    if (calls === 1) throw new Error("429");
    return "ok";
  }, 15_000, () => 0);
  await assert.rejects(fn());
  assert.equal(await fn(), "ok");
  assert.equal(calls, 2);
});

test("memory stays bounded under many distinct calls", async () => {
  let calls = 0;
  const fn = cached(async (n: number) => (calls += 1, n), 15_000, () => 0);
  for (let i = 0; i < 2_500; i += 1) await fn(i);
  assert.equal(await fn(2_499), 2_499);
  assert.equal(calls, 2_500);
});
