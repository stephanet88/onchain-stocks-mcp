import { z } from "zod";
import { issuerName } from "./issuer.ts";
import { ageMinutes, effectivePrice, gapPct } from "./metrics.ts";
import { defineTool, MAX_BUY_USD } from "./types.ts";

// the quoted fill is this far from the listed token price: thin or stale market data
export const UNRELIABLE_LISTING_PCT = 20;

const searchStocks = defineTool({
  name: "search_stocks",
  description:
    "Find tokenized versions of a stock on Solana. Returns the real share price and its age, and every token with issuer, redeemability, liquidity tier, listed price and mint.",
  keyed: true,
  input: { query: z.string().trim().min(1).describe("Company name or ticker, e.g. Tesla or NVDA") },
  run: async (session, { query }, signal) => {
    const assets = await session.keyedSources().search(query, signal);
    return {
      source: "tokens.xyz",
      results: assets.map((asset) => {
        const tokens = (asset.variants ?? []).filter((v) => v.kind === "tokenized_equity");
        for (const variant of tokens) session.known.set(variant.mint, { asset, variant });
        return {
          stock: asset.name ?? asset.symbol,
          symbol: asset.symbol,
          sharePrice: asset.canonicalMarket?.price ?? null,
          sharePriceAgeMinutes: ageMinutes(asset.canonicalMarket?.asOf, session.sources.now()),
          tokens: tokens.map((v) => ({
            mint: v.mint,
            issuer: issuerName(v, asset.symbol),
            redeemable: v.stockVariantTier ?? null,
            liquidityTier: v.liquidityTier ?? v.trustTier ?? null,
            liquidityUsd: v.market?.liquidity ?? null,
            listedPrice: v.market?.price ?? null,
            advisory: v.advisory?.status ?? null,
          })),
        };
      }),
    };
  },
});

const UNKNOWN_MINT = { error: "unknown mint: call search_stocks first and use a mint it returned" };

const quoteBuy = defineTool({
  name: "quote_buy",
  description:
    "Quote buying a token with USDC through Jupiter. Returns the price paid per token and the all-in cost against the real share price. The mint must come from search_stocks.",
  keyed: true,
  input: { mint: z.string(), usd: z.number().min(1).max(MAX_BUY_USD).describe(`Amount of USDC, 1 to ${MAX_BUY_USD}`) },
  run: async (session, { mint, usd }, signal) => {
    const known = session.known.get(mint);
    if (!known) return UNKNOWN_MINT;
    const decimals = known.variant.market?.decimals;
    if (decimals == null) return { error: "token decimals unknown, cannot price the quote" };
    const q = await session.sources.quote(mint, usd, signal);
    const paid = effectivePrice(usd, q.outAmount, decimals);
    const listedVsQuotedPct = gapPct(paid, known.variant.market?.price);
    return {
      source: "Jupiter quote (not a fill)",
      quotedAt: new Date(session.sources.now()).toISOString(),
      usd,
      pricePaidPerToken: paid,
      sharePrice: known.asset.canonicalMarket?.price ?? null,
      costVsSharePct: gapPct(paid, known.asset.canonicalMarket?.price),
      priceImpactPct: Number(q.priceImpactPct) * 100,
      route: q.routePlan.map((step) => step.swapInfo.label ?? "unknown"),
      listedPriceNotExecutable: listedVsQuotedPct != null && Math.abs(listedVsQuotedPct) > UNRELIABLE_LISTING_PCT,
    };
  },
});

const riskScore = defineTool({
  name: "risk_score",
  description: "Market risk score (0 to 100, grade A/B/C) for a token, from liquidity, holder spread and trading activity. The mint must come from search_stocks.",
  keyed: true,
  input: { mint: z.string() },
  run: async (session, { mint }, signal) => {
    if (!session.known.has(mint)) return UNKNOWN_MINT;
    const r = await session.keyedSources().risk(mint, signal);
    return { source: "tokens.xyz risk summary", score: r.score, grade: r.grade, label: r.label, caps: r.caps, insufficientData: r.hasInsufficientData };
  },
});

export const KEYED_TOOLS = [searchStocks, quoteBuy, riskScore];
