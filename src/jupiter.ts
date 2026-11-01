import { getJson, type Fetch } from "./http.ts";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";

export interface Quote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string } }[];
}

// buy `usd` worth of `mint` with USDC; amounts are in base units
export async function quoteBuy(mint: string, usd: number, fetchImpl?: Fetch): Promise<Quote> {
  const amount = Math.round(usd * 10 ** USDC_DECIMALS);
  const url = `${QUOTE_URL}?inputMint=${USDC_MINT}&outputMint=${mint}&amount=${amount}&slippageBps=100`;
  // the free lite API rate-limits hard; back off for up to ~30 s before giving up
  return getJson<Quote>(url, {}, fetchImpl, 5, 1_000);
}
