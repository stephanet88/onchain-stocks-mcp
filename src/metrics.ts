// price paid per token for a buy of `usd`, given the raw out amount and the token's decimals
export function effectivePrice(usd: number, outAmount: string, decimals: number): number | null {
  const tokens = Number(outAmount) / 10 ** decimals;
  return tokens > 0 ? usd / tokens : null;
}

// percent above (+) or below (-) the reference
export function gapPct(price: number | null | undefined, reference: number | null | undefined): number | null {
  if (price == null || reference == null || reference <= 0) return null;
  return (price / reference - 1) * 100;
}

// canonicalMarket.asOf is unix seconds
export function ageMinutes(asOfSeconds: number | null | undefined, nowMs: number): number | null {
  if (asOfSeconds == null) return null;
  return Math.max(0, Math.round((nowMs - asOfSeconds * 1000) / 60_000));
}
