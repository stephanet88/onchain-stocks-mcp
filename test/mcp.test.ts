import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/mcp.ts";
import type { Sources } from "../src/tools.ts";
import type { StockAsset } from "../src/tokens.ts";

const TESLA: StockAsset = {
  assetId: "tesla",
  name: "Tesla",
  symbol: "TSLA",
  canonicalMarket: { price: 400, asOf: 1_000_000, source: "s" },
  variants: [
    {
      variantId: "tesla:xStock",
      mint: "TSLAX",
      kind: "tokenized_equity",
      label: "xStock",
      stockVariantTier: "cash_redeemable",
      liquidityTier: "tier2",
      advisory: null,
      market: { price: 404, liquidity: 4_000_000, decimals: 8 },
    },
  ],
};

function sources(over: Partial<Sources> = {}): Sources {
  return {
    search: async () => [TESLA],
    // $1k buys 2.5 tokens: $400 each
    quote: async (_m, usd) => ({ inAmount: "0", outAmount: String((usd / 400) * 1e8), priceImpactPct: "0.001", routePlan: [{ swapInfo: { label: "Whirlpool" } }] }),
    risk: async () => ({ score: 100, grade: "A", label: "Established", caps: [], hasInsufficientData: false, insufficientDataReason: null }),
    now: () => 1_000_000_000 + 30 * 60_000,
    ...over,
  };
}

async function connect(src: Sources = sources()) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(src).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text: string }>;
  return { isError: res.isError === true, body: JSON.parse(content[0]!.text) };
}

test("lists the three read-only tools with instructions", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["quote_buy", "risk_score", "search_stocks"]);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
  assert.match(client.getInstructions() ?? "", /not fills/);
});

test("search then quote: cost against the share price, through the protocol", async () => {
  const client = await connect();
  const search = await call(client, "search_stocks", { query: "Tesla" });
  assert.equal(search.body.results[0].tokens[0].issuer, "Backed (xStock)");
  const quote = await call(client, "quote_buy", { mint: "TSLAX", usd: 1_000 });
  assert.equal(quote.isError, false);
  assert.equal(quote.body.costVsSharePct, 0);
  assert.equal(quote.body.source, "Jupiter quote (not a fill)");
});

test("a mint no search returned is refused as a tool error", async () => {
  const client = await connect();
  const res = await call(client, "quote_buy", { mint: "SCAM", usd: 1_000 });
  assert.equal(res.isError, true);
  assert.match(res.body.error, /call search_stocks first/);
});

test("searches do not leak between clients", async () => {
  const src = sources();
  const a = await connect(src);
  const b = await connect(src);
  await call(a, "search_stocks", { query: "Tesla" });
  assert.equal((await call(b, "quote_buy", { mint: "TSLAX", usd: 1_000 })).isError, true);
});

test("out-of-range amounts and failing sources come back as errors, the server keeps serving", async () => {
  const client = await connect(sources({ risk: async () => { throw new Error("503 from tokens.xyz"); } }));
  await call(client, "search_stocks", { query: "Tesla" });
  assert.equal((await call(client, "quote_buy", { mint: "TSLAX", usd: 10_000_000 })).isError, true);
  const risk = await call(client, "risk_score", { mint: "TSLAX" });
  assert.equal(risk.isError, true);
  assert.match(risk.body.error, /source failed: 503/);
  assert.equal((await call(client, "quote_buy", { mint: "TSLAX", usd: 1_000 })).isError, false);
});

test("arguments of the wrong type are rejected before reaching the tools", async () => {
  const client = await connect();
  const res = await client.callTool({ name: "quote_buy", arguments: { mint: "TSLAX", usd: "lots" } });
  assert.equal(res.isError, true);
});
