import { CATALOG } from "./catalog.ts";
import { HttpError } from "./http.ts";
import type { Quote } from "./jupiter.ts";
import { ageMinutes, effectivePrice, gapPct } from "./metrics.ts";
import type { RiskSummary, StockAsset, Variant } from "./tokens.ts";

// search and risk need a tokens.xyz key; without them only the keyless tools run
export interface Sources {
  quote: (mint: string, usd: number) => Promise<Quote>;
  now: () => number;
  search?: (query: string) => Promise<StockAsset[]>;
  risk?: (mint: string) => Promise<RiskSummary>;
}

export interface CatalogToken {
  symbol: string;
  name: string;
  issuer: string;
  mint: string;
  decimals: number;
  redeemable: Variant["stockVariantTier"] | null;
}

export interface Catalog {
  generatedAt: string;
  tokens: CatalogToken[];
}

export const MAX_BUY_USD = 250_000;
const DEFAULT_SIZES = [1_000, 10_000, 50_000];
const MAX_SIZES = 5;

// the quoted fill is this far from the listed token price: thin or stale market data
export const UNRELIABLE_LISTING_PCT = 20;

const ISSUER_BY_LABEL: Record<string, string> = { xStock: "Backed (xStock)" };

export function issuerName(variant: Variant, symbol: string | undefined): string {
  if (variant.issuer) return variant.issuer === "Backed" ? "Backed (xStock)" : variant.issuer;
  const mapped = variant.label ? ISSUER_BY_LABEL[variant.label] : undefined;
  if (mapped) return mapped;
  // without an issuer field the name often carries it: "Apple - Backpack Securities"
  const fromName = variant.name?.split(" - ")[1]?.trim();
  if (fromName) return fromName;
  // some variants carry only the ticker as label, which says nothing about who issued them
  if (variant.label && variant.label.toLowerCase() !== symbol?.toLowerCase()) return variant.label;
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
  {
    type: "function",
    function: {
      name: "list_tokens",
      description:
        "List the tokenized stocks this server covers without an API key: symbol, issuer, redeemability and mint. Filter by ticker or company name, or leave the query empty for all.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Ticker or company name, e.g. TSLA or Nvidia" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_sizes",
      description:
        "Quote buying one token at several USDC sizes through Jupiter and show how much more each size pays per token than the smallest (slippage). No API key needed. The mint must come from list_tokens.",
      parameters: {
        type: "object",
        properties: {
          mint: { type: "string" },
          sizes: { type: "array", items: { type: "number" }, description: `Up to ${MAX_SIZES} USDC amounts, default 1000, 10000, 50000` },
        },
        required: ["mint"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_issuers",
      description:
        "Quote the same USDC buy for every issuer's token of one stock (e.g. xStock vs Ondo) and rank them by price paid per token. No API key needed.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string", description: "Ticker, e.g. TSLA" }, usd: { type: "number", description: "Amount of USDC, default 1000" } },
        required: ["symbol"],
      },
    },
  },
] as const;

export const KEYED_TOOLS = ["search_stocks", "quote_buy", "risk_score"];

const NEEDS_KEY = { error: "this tool needs a TOKENS_API_KEY: use list_tokens, quote_sizes and compare_issuers without one" };

const validUsd = (usd: unknown): usd is number => typeof usd === "number" && Number.isFinite(usd) && usd >= 1 && usd <= MAX_BUY_USD;

function quoteError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 429) return "rate limited";
    if (/route/i.test(err.body)) return "no route";
  }
  return "quote failed";
}

const describe = (t: CatalogToken) => ({ symbol: t.symbol, name: t.name, issuer: t.issuer, mint: t.mint, redeemable: t.redeemable });

interface Known {
  asset: StockAsset;
  variant: Variant;
}

// one instance per conversation: remembers which mints a search returned
export class Tools {
  private readonly known = new Map<string, Known>();
  private readonly sources: Sources;
  private readonly catalog: Catalog;

  constructor(sources: Sources, catalog: Catalog = CATALOG) {
    this.sources = sources;
    this.catalog = catalog;
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
      if (name === "list_tokens") return this.listTokens(String(args.query ?? ""));
      if (name === "quote_sizes") return await this.quoteSizes(String(args.mint ?? ""), args.sizes ?? DEFAULT_SIZES);
      if (name === "compare_issuers") return await this.compareIssuers(String(args.symbol ?? ""), args.usd ?? 1_000);
      return { error: `unknown tool ${name}` };
    } catch (err) {
      return { error: `source failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` };
    }
  }

  private async searchStocks(query: string) {
    if (!this.sources.search) return NEEDS_KEY;
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
    if (!this.sources.risk) return NEEDS_KEY;
    if (!this.known.has(mint)) return { error: "unknown mint: call search_stocks first and use a mint it returned" };
    const r = await this.sources.risk(mint);
    return { source: "tokens.xyz risk summary", score: r.score, grade: r.grade, label: r.label, caps: r.caps, insufficientData: r.hasInsufficientData };
  }

  private listTokens(query: string) {
    const q = query.trim().toLowerCase();
    const matches = this.catalog.tokens.filter((t) => !q || t.symbol.toLowerCase() === q || t.name.toLowerCase().includes(q));
    return { source: `built-in list from tokens.xyz, ${this.catalog.generatedAt}`, results: matches.map(describe) };
  }

  private async quoteSizes(mint: string, sizes: unknown) {
    const token = this.catalog.tokens.find((t) => t.mint === mint);
    if (!token) return { error: "unknown mint: use a mint from list_tokens" };
    if (!Array.isArray(sizes) || sizes.length === 0 || sizes.length > MAX_SIZES || !sizes.every(validUsd)) {
      return { error: `sizes must be 1 to ${MAX_SIZES} USDC amounts between 1 and ${MAX_BUY_USD}` };
    }
    let smallest: number | null = null;
    const quotes = [];
    for (const usd of [...sizes].sort((a, b) => a - b)) {
      try {
        const q = await this.sources.quote(mint, usd);
        const price = effectivePrice(usd, q.outAmount, token.decimals);
        smallest ??= price;
        quotes.push({ usd, pricePerToken: price, vsSmallestPct: gapPct(price, smallest), route: q.routePlan.map((s) => s.swapInfo.label ?? "unknown") });
      } catch (err) {
        quotes.push({ usd, error: quoteError(err) });
      }
    }
    return { source: "Jupiter quotes (not fills)", quotedAt: new Date(this.sources.now()).toISOString(), token: describe(token), quotes };
  }

  private async compareIssuers(symbol: string, usd: unknown) {
    const tokens = this.catalog.tokens.filter((t) => t.symbol.toLowerCase() === symbol.trim().toLowerCase());
    if (tokens.length === 0) return { error: `no tokens for "${symbol}": use list_tokens to see what is covered` };
    if (!validUsd(usd)) return { error: `usd must be between 1 and ${MAX_BUY_USD}` };
    const priced: (ReturnType<typeof describe> & { pricePerToken: number })[] = [];
    const failed: (ReturnType<typeof describe> & { error: string })[] = [];
    for (const token of tokens) {
      try {
        const q = await this.sources.quote(token.mint, usd);
        const price = effectivePrice(usd, q.outAmount, token.decimals);
        if (price == null) failed.push({ ...describe(token), error: "quote returned no tokens" });
        else priced.push({ ...describe(token), pricePerToken: price });
      } catch (err) {
        failed.push({ ...describe(token), error: quoteError(err) });
      }
    }
    priced.sort((a, b) => a.pricePerToken - b.pricePerToken);
    const cheapest = priced[0]?.pricePerToken;
    return {
      source: "Jupiter quotes (not fills)",
      quotedAt: new Date(this.sources.now()).toISOString(),
      usd,
      note: "Prices are what a Jupiter route charges now, not the issuer's own mint or redeem price: a large gap usually means a thin route. Tokens of one stock can also differ in what they represent (redeemability, dividends).",
      ranked: priced.map((r) => ({ ...r, vsCheapestPct: gapPct(r.pricePerToken, cheapest) })),
      failed,
    };
  }
}
