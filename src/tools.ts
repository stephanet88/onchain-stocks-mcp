import type { Quote } from "./jupiter.ts";
import { ageMinutes, effectivePrice, gapPct } from "./metrics.ts";
import type { RiskSummary, StockAsset, Variant } from "./tokens.ts";

export interface Sources {
  search: (query: string) => Promise<StockAsset[]>;
  quote: (mint: string, usd: number) => Promise<Quote>;
  risk: (mint: string) => Promise<RiskSummary>;
  now: () => number;
}

export const MAX_BUY_USD = 250_000;

// the quoted fill is this far from the listed token price: thin or stale market data
export const UNRELIABLE_LISTING_PCT = 20;

const ISSUER_BY_LABEL: Record<string, string> = { xStock: "Backed (xStock)" };

export function issuerName(variant: Variant, symbol: string | undefined): string {
  if (variant.issuer) return variant.issuer === "Backed" ? "Backed (xStock)" : variant.issuer;
  const mapped = variant.label ? ISSUER_BY_LABEL[variant.label] : undefined;
  if (mapped) return mapped;
  // some variants carry only the ticker as label, which says nothing about who issued them
  if (variant.label && variant.label !== symbol) return variant.label;
  return "unknown";
}

export const TOOL_SPECS = [
  {
    type: "function",
    function: {
      name: "search_stocks",
      description:
        "Find tokenized versions of a stock on Solana. Returns the real share price and its age, and every token with issuer, redeemability, liquidity tier, listed price and mint.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Company name or ticker, e.g. Tesla or NVDA" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_buy",
      description:
        "Quote buying a token with USDC through Jupiter. Returns the price paid per token and the all-in cost against the real share price. The mint must come from search_stocks.",
      parameters: {
        type: "object",
        properties: {
          mint: { type: "string" },
          usd: { type: "number", description: `Amount of USDC, 1 to ${MAX_BUY_USD}` },
        },
        required: ["mint", "usd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "risk_score",
      description: "Market risk score (0 to 100, grade A/B/C) for a token, from liquidity, holder spread and trading activity. The mint must come from search_stocks.",
      parameters: { type: "object", properties: { mint: { type: "string" } }, required: ["mint"] },
    },
  },
] as const;

interface Known {
  asset: StockAsset;
  variant: Variant;
}

// one instance per conversation: remembers which mints a search returned
export class Tools {
  private readonly known = new Map<string, Known>();
  private readonly sources: Sources;

  constructor(sources: Sources) {
    this.sources = sources;
  }

  async call(name: string, rawArgs: string): Promise<unknown> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArgs || "{}");
    } catch {
      return { error: "arguments are not valid JSON" };
    }
    try {
      if (name === "search_stocks") return await this.searchStocks(String(args.query ?? ""));
      if (name === "quote_buy") return await this.quoteBuy(String(args.mint ?? ""), Number(args.usd));
      if (name === "risk_score") return await this.riskScore(String(args.mint ?? ""));
      return { error: `unknown tool ${name}` };
    } catch (err) {
      return { error: `source failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` };
    }
  }

  private async searchStocks(query: string) {
    if (!query.trim()) return { error: "query is empty" };
    const assets = await this.sources.search(query);
    return {
      source: "tokens.xyz",
      results: assets.map((asset) => {
        const tokens = (asset.variants ?? []).filter((v) => v.kind === "tokenized_equity");
        for (const variant of tokens) this.known.set(variant.mint, { asset, variant });
        return {
          stock: asset.name ?? asset.symbol,
          symbol: asset.symbol,
          sharePrice: asset.canonicalMarket?.price ?? null,
          sharePriceAgeMinutes: ageMinutes(asset.canonicalMarket?.asOf, this.sources.now()),
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
  }

  private async quoteBuy(mint: string, usd: number) {
    const known = this.known.get(mint);
    if (!known) return { error: "unknown mint: call search_stocks first and use a mint it returned" };
    if (!Number.isFinite(usd) || usd < 1 || usd > MAX_BUY_USD) return { error: `usd must be between 1 and ${MAX_BUY_USD}` };
    const decimals = known.variant.market?.decimals;
    if (decimals == null) return { error: "token decimals unknown, cannot price the quote" };
    const q = await this.sources.quote(mint, usd);
    const paid = effectivePrice(usd, q.outAmount, decimals);
    const listedVsQuotedPct = gapPct(paid, known.variant.market?.price);
    return {
      source: "Jupiter quote (not a fill)",
      quotedAt: new Date(this.sources.now()).toISOString(),
      usd,
      pricePaidPerToken: paid,
      sharePrice: known.asset.canonicalMarket?.price ?? null,
      costVsSharePct: gapPct(paid, known.asset.canonicalMarket?.price),
      priceImpactPct: Number(q.priceImpactPct) * 100,
      route: q.routePlan.map((step) => step.swapInfo.label ?? "unknown"),
      listedPriceNotExecutable: listedVsQuotedPct != null && Math.abs(listedVsQuotedPct) > UNRELIABLE_LISTING_PCT,
    };
  }

  private async riskScore(mint: string) {
    if (!this.known.has(mint)) return { error: "unknown mint: call search_stocks first and use a mint it returned" };
    const r = await this.sources.risk(mint);
    return { source: "tokens.xyz risk summary", score: r.score, grade: r.grade, label: r.label, caps: r.caps, insufficientData: r.hasInsufficientData };
  }
}
