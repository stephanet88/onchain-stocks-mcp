import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../src/http.ts";
import { issuerName } from "../src/issuer.ts";
import { Session } from "../src/session.ts";
import type { Catalog, Sources } from "../src/types.ts";
import type { Variant } from "../src/tokens.ts";

const CATALOG: Catalog = {
  generatedAt: "2026-11-01",
  tokens: [
    { symbol: "TSLA", name: "Tesla", issuer: "Backed (xStock)", mint: "XS", decimals: 8, redeemable: "cash_redeemable" },
    { symbol: "TSLA", name: "Tesla", issuer: "Ondo", mint: "ONDO", decimals: 9, redeemable: "cash_redeemable" },
    { symbol: "TSLA", name: "Tesla", issuer: "Backpack Securities", mint: "BP", decimals: 6, redeemable: "share_redeemable" },
    { symbol: "NVDA", name: "Nvidia", issuer: "Backed (xStock)", mint: "NV", decimals: 8, redeemable: "cash_redeemable" },
  ],
};

// tokens per $1 at $400 a token, scaled to each mint's decimals; Ondo is 1% dearer, size adds 0.5% per $10k
const PRICE: Record<string, number> = { XS: 400, ONDO: 404, BP: 400, NV: 200 };
const DECIMALS: Record<string, number> = { XS: 8, ONDO: 9, BP: 6, NV: 8 };
function sources(over: Partial<Sources> = {}): Sources {
  return {
    quote: async (mint, usd) => {
      const price = (PRICE[mint] ?? 1) * (1 + 0.005 * Math.floor(usd / 10_000));
      return { inAmount: "0", outAmount: String(Math.round((usd / price) * 10 ** (DECIMALS[mint] ?? 6))), priceImpactPct: "0", routePlan: [{ swapInfo: { label: "Pool" } }] };
    },
    now: () => 1_000_000,
    ...over,
  };
}

const call = <T = { error?: string }>(session: Session, name: string, args: unknown) => session.call(name, args) as Promise<T>;

test("list_tokens filters by ticker or name, empty query lists all", async () => {
  const session = new Session(sources(), CATALOG);
  interface List {
    results: { mint: string }[];
  }
  assert.equal((await call<List>(session, "list_tokens", { query: "tsla" })).results.length, 3);
  assert.deepEqual((await call<List>(session, "list_tokens", { query: "nvid" })).results.map((r) => r.mint), ["NV"]);
  assert.equal((await call<List>(session, "list_tokens", {})).results.length, 4);
});

test("quote_sizes: slippage against the smallest size, sorted, per-size errors kept", async () => {
  let n = 0;
  const flaky = sources({
    quote: async (mint, usd) => {
      n += 1;
      if (n === 2) throw new HttpError("u", 429, "");
      return sources().quote(mint, usd);
    },
  });
  const res = await call<{ quotes: { usd: number; vsSmallestPct?: number | null; error?: string }[] }>(new Session(flaky, CATALOG), "quote_sizes", {
    mint: "XS",
    sizes: [20_000, 1_000, 10_000],
  });
  assert.deepEqual(res.quotes.map((q) => [q.usd, q.error ?? q.vsSmallestPct?.toFixed(2)]), [
    [1_000, "0.00"],
    [10_000, "rate limited"],
    [20_000, "1.00"],
  ]);
});

test("quote_sizes refuses unknown mints and bad sizes", async () => {
  const session = new Session(sources(), CATALOG);
  assert.match(String((await call(session, "quote_sizes", { mint: "SCAM" })).error), /list_tokens/);
  for (const sizes of [[], [0], [1, 2, 3, 4, 5, 6], ["lots"], [1e9]]) {
    assert.match(String((await call(session, "quote_sizes", { mint: "XS", sizes })).error), /bad arguments: sizes/, JSON.stringify(sizes));
  }
});

test("compare_issuers ranks by price per token across decimals, failures listed apart", async () => {
  const failing = sources({
    quote: async (mint, usd) => {
      if (mint === "BP") throw new HttpError("u", 400, '{"error":"Could not find any route"}');
      return sources().quote(mint, usd);
    },
  });
  const res = await call<{ ranked: { issuer: string; pricePerToken: number; vsCheapestPct: number }[]; failed: { issuer: string; error: string }[] }>(
    new Session(failing, CATALOG),
    "compare_issuers",
    { symbol: "tsla", usd: 1_000 },
  );
  assert.deepEqual(res.ranked.map((r) => [r.issuer, r.pricePerToken.toFixed(2), r.vsCheapestPct.toFixed(2)]), [
    ["Backed (xStock)", "400.00", "0.00"],
    ["Ondo", "404.00", "1.00"],
  ]);
  assert.deepEqual(res.failed.map((f) => [f.issuer, f.error]), [["Backpack Securities", "no route"]]);
});

test("compare_issuers: unknown ticker and bad amount are errors", async () => {
  const session = new Session(sources(), CATALOG);
  assert.match(String((await call(session, "compare_issuers", { symbol: "ZZZZ" })).error), /no tokens/);
  assert.match(String((await call(session, "compare_issuers", { symbol: "TSLA", usd: -5 })).error), /bad arguments: usd/);
});

test("keyed tools without a key say so instead of failing", async () => {
  const session = new Session(sources(), CATALOG);
  assert.match(String((await call(session, "search_stocks", { query: "Tesla" })).error), /TOKENS_API_KEY/);
  assert.match(String((await call(session, "risk_score", { mint: "XS" })).error), /TOKENS_API_KEY/);
});

test("issuer from the name when there is no issuer field, ticker labels ignored in any case", () => {
  const base: Variant = { variantId: "v", mint: "m", kind: "tokenized_equity", advisory: null, market: null };
  assert.equal(issuerName({ ...base, label: "AAPL", name: "Apple - Backpack Securities" }, "AAPL"), "Backpack Securities");
  assert.equal(issuerName({ ...base, label: "FIGUREAI" }, "figureai"), "unknown");
  assert.equal(issuerName({ ...base, issuer: "Backed" }, "TSLA"), "Backed (xStock)");
  assert.equal(issuerName({ ...base, label: "Ondo" }, "TSLA"), "Ondo");
});

test("compare_issuers with a key adds the gap to the real share; a failing search keeps the ranking", async () => {
  const share = { assetId: "tesla", symbol: "TSLA", canonicalMarket: { price: 400, asOf: 1_000, source: "s" }, variants: [] };
  interface Compared {
    sharePrice: number | null;
    ranked: { issuer: string; vsSharePct: number | null }[];
  }
  const keyed = await call<Compared>(new Session(sources({ search: async () => [share] }), CATALOG), "compare_issuers", { symbol: "TSLA" });
  assert.equal(keyed.sharePrice, 400);
  assert.deepEqual(keyed.ranked.map((r) => [r.issuer, r.vsSharePct?.toFixed(2)]), [
    ["Backed (xStock)", "0.00"],
    ["Backpack Securities", "0.00"],
    ["Ondo", "1.00"],
  ]);
  const broken = sources({ search: async () => { throw new Error("503"); } });
  const fallback = await call<Compared>(new Session(broken, CATALOG), "compare_issuers", { symbol: "TSLA" });
  assert.equal(fallback.sharePrice, null);
  assert.equal(fallback.ranked.length, 3);
  assert.ok(fallback.ranked.every((r) => r.vsSharePct === null));
});

test("a hung or failing upstream becomes a labelled error, never a hang or a crash", async () => {
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const slow = sources({ quote: async () => { throw timeout; } });
  const res = await call<{ quotes: { error?: string }[] }>(new Session(slow, CATALOG), "quote_sizes", { mint: "XS", sizes: [1_000] });
  assert.equal(res.quotes[0]?.error, "timed out");
  const keyed = sources({ search: async () => { throw timeout; }, risk: async () => { throw new HttpError("u", 503, "down"); } });
  assert.equal((await call(new Session(keyed, CATALOG), "search_stocks", { query: "Tesla" })).error, "source timed out");
});

test("unknown tools and missing arguments are rejected by name", async () => {
  const session = new Session(sources(), CATALOG);
  assert.match(String((await call(session, "trade_now", {})).error), /unknown tool trade_now/);
  assert.match(String((await call(session, "compare_issuers", {})).error), /bad arguments: symbol/);
});

test("issuer from the last dash segment, so company names with dashes survive", () => {
  const base: Variant = { variantId: "v", mint: "m", kind: "tokenized_equity", advisory: null, market: null };
  assert.equal(issuerName({ ...base, label: "KO", name: "Coca - Cola - Ondo" }, "KO"), "Ondo");
  assert.equal(issuerName({ ...base, label: "KO", name: "Coca-Cola" }, "KO"), "unknown");
});
