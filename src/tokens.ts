import { getJson, type Fetch } from "./http.ts";

const BASE = "https://api.tokens.xyz/v1";

export interface Variant {
  variantId: string;
  mint: string;
  kind: string;
  label?: string;
  issuer?: string;
  liquidityTier?: string;
  trustTier?: string;
  stockVariantTier?: "share_redeemable" | "cash_redeemable" | "not_redeemable";
  advisory: { status: string; reason?: string } | null;
  market: { price?: number; liquidity?: number; volume24hUSD?: number; decimals?: number; holder?: number } | null;
}

export interface StockAsset {
  assetId: string;
  name?: string;
  symbol?: string;
  canonicalMarket?: { price: number; asOf: number; source: string } | null;
  variants?: Variant[];
}

export interface RiskSummary {
  score: number;
  grade: "A" | "B" | "C";
  label: string;
  caps: string[];
  hasInsufficientData: boolean;
  insufficientDataReason: string | null;
}

export async function searchStocks(apiKey: string, query: string, fetchImpl?: Fetch): Promise<StockAsset[]> {
  const url = `${BASE}/assets/search?q=${encodeURIComponent(query)}&category=equity&variants=all&limit=5`;
  const body = await getJson<{ results: StockAsset[] }>(url, { "x-api-key": apiKey }, fetchImpl);
  return body.results;
}

export async function riskSummary(apiKey: string, mint: string, fetchImpl?: Fetch): Promise<RiskSummary> {
  return getJson<RiskSummary>(`${BASE}/assets/risk-summary?mint=${mint}`, { "x-api-key": apiKey }, fetchImpl);
}
