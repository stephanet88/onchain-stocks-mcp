import { z } from "zod";
import { describeError } from "./http.ts";
import { ageMinutes, effectivePrice, gapPct } from "./metrics.ts";
import type { Session } from "./session.ts";
import { defineTool, MAX_BUY_USD, type CatalogToken } from "./types.ts";

const usd = z.number().min(1).max(MAX_BUY_USD);
const describe = (t: CatalogToken) => ({ symbol: t.symbol, name: t.name, issuer: t.issuer, mint: t.mint, redeemable: t.redeemable });
type Described = ReturnType<typeof describe>;

const listTokens = defineTool({
  name: "list_tokens",
  description:
    "List the tokenized stocks this server covers without an API key: symbol, issuer, redeemability and mint. Filter by ticker or company name, or leave the query empty for all.",
  keyed: false,
  input: { query: z.string().optional().describe("Ticker or company name, e.g. TSLA or Nvidia") },
  run: async (session, { query }) => {
    const q = (query ?? "").trim().toLowerCase();
    const matches = session.catalog.tokens.filter((t) => !q || t.symbol.toLowerCase() === q || t.name.toLowerCase().includes(q));
    return { source: `built-in list from tokens.xyz, ${session.catalog.generatedAt}`, results: matches.map(describe) };
  },
});

const quoteSizes = defineTool({
  name: "quote_sizes",
  description:
    "Quote buying one token at several USDC sizes through Jupiter and show how much more each size pays per token than the smallest (slippage). No API key needed. The mint must come from list_tokens.",
  keyed: false,
  input: {
    mint: z.string(),
    sizes: z.array(usd).min(1).max(5).default([1_000, 10_000, 50_000]).describe("Up to 5 USDC amounts, default 1000, 10000, 50000"),
  },
  run: async (session, { mint, sizes }) => {
    const token = session.catalog.tokens.find((t) => t.mint === mint);
    if (!token) return { error: "unknown mint: use a mint from list_tokens" };
    let smallest: number | null = null;
    const quotes = [];
    for (const size of [...sizes].sort((a, b) => a - b)) {
      try {
        const q = await session.sources.quote(mint, size);
        const price = effectivePrice(size, q.outAmount, token.decimals);
        smallest ??= price;
        quotes.push({ usd: size, pricePerToken: price, vsSmallestPct: gapPct(price, smallest), route: q.routePlan.map((s) => s.swapInfo.label ?? "unknown") });
      } catch (err) {
        quotes.push({ usd: size, error: describeError(err) });
      }
    }
    return { source: "Jupiter quotes (not fills)", quotedAt: new Date(session.sources.now()).toISOString(), token: describe(token), quotes };
  },
});

// the real share price needs the keyed search; without a key, or if it fails, comparisons stay token to token
async function sharePrice(session: Session, symbol: string): Promise<{ price: number; ageMinutes: number | null } | null> {
  if (!session.sources.search) return null;
  try {
    const assets = await session.sources.search(symbol);
    const market = assets.find((a) => a.symbol?.toLowerCase() === symbol.toLowerCase())?.canonicalMarket;
    return market ? { price: market.price, ageMinutes: ageMinutes(market.asOf, session.sources.now()) } : null;
  } catch {
    return null;
  }
}

const compareIssuers = defineTool({
  name: "compare_issuers",
  description:
    "Quote the same USDC buy for every issuer's token of one stock (e.g. xStock vs Ondo) and rank them by price paid per token. No API key needed; with one, each token is also compared to the real share price.",
  keyed: false,
  input: { symbol: z.string().describe("Ticker, e.g. TSLA"), usd: usd.default(1_000).describe(`Amount of USDC, 1 to ${MAX_BUY_USD}, default 1000`) },
  run: async (session, { symbol, usd: amount }) => {
    const ticker = symbol.trim();
    const tokens = session.catalog.tokens.filter((t) => t.symbol.toLowerCase() === ticker.toLowerCase());
    if (tokens.length === 0) return { error: `no tokens for "${symbol}": use list_tokens to see what is covered` };
    const priced: (Described & { pricePerToken: number })[] = [];
    const failed: (Described & { error: string })[] = [];
    for (const token of tokens) {
      try {
        const q = await session.sources.quote(token.mint, amount);
        const price = effectivePrice(amount, q.outAmount, token.decimals);
        if (price == null) failed.push({ ...describe(token), error: "quote returned no tokens" });
        else priced.push({ ...describe(token), pricePerToken: price });
      } catch (err) {
        failed.push({ ...describe(token), error: describeError(err) });
      }
    }
    priced.sort((a, b) => a.pricePerToken - b.pricePerToken);
    const cheapest = priced[0]?.pricePerToken;
    const share = await sharePrice(session, ticker);
    return {
      source: "Jupiter quotes (not fills)",
      quotedAt: new Date(session.sources.now()).toISOString(),
      usd: amount,
      sharePrice: share?.price ?? null,
      sharePriceAgeMinutes: share?.ageMinutes ?? null,
      note: "Prices are what a Jupiter route charges now, not the issuer's own mint or redeem price: a large gap usually means a thin route. Tokens of one stock can also differ in what they represent (redeemability, dividends).",
      ranked: priced.map((r) => ({ ...r, vsCheapestPct: gapPct(r.pricePerToken, cheapest), vsSharePct: gapPct(r.pricePerToken, share?.price) })),
      failed,
    };
  },
});

export const KEYLESS_TOOLS = [listTokens, compareIssuers, quoteSizes];
