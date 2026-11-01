import { test } from "node:test";
import assert from "node:assert/strict";
import { ageMinutes, effectivePrice, gapPct } from "../src/metrics.ts";

test("effective price from a real TSLAx quote: $10k for 25.27713354 tokens", () => {
  assert.equal(effectivePrice(10_000, "2527713354", 8)?.toFixed(2), "395.61");
});

test("effective price is null when nothing comes out", () => {
  assert.equal(effectivePrice(1_000, "0", 8), null);
});

test("gap is signed against the reference", () => {
  assert.equal(gapPct(101, 100)?.toFixed(2), "1.00");
  assert.equal(gapPct(99, 100)?.toFixed(2), "-1.00");
  assert.equal(gapPct(null, 100), null);
  assert.equal(gapPct(100, 0), null);
});

test("age of the share price in minutes, never negative", () => {
  assert.equal(ageMinutes(1_000, 1_000_000 + 30 * 60_000), 30);
  assert.equal(ageMinutes(2_000, 1_000_000), 0);
  assert.equal(ageMinutes(undefined, 1), null);
});
