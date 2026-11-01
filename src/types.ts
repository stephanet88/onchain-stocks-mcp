import type { z } from "zod";
import type { Quote } from "./jupiter.ts";
import type { Session } from "./session.ts";
import type { RiskSummary, StockAsset, Variant } from "./tokens.ts";

// search and risk need a tokens.xyz key; without them only the keyless tools run
export interface Sources {
  quote: (mint: string, usd: number, signal?: AbortSignal) => Promise<Quote>;
  now: () => number;
  search?: (query: string, signal?: AbortSignal) => Promise<StockAsset[]>;
  risk?: (mint: string, signal?: AbortSignal) => Promise<RiskSummary>;
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

export interface Known {
  asset: StockAsset;
  variant: Variant;
}

export const MAX_BUY_USD = 250_000;

// one definition per tool: the zod input is both the MCP schema and the validation
export interface ToolDef {
  name: string;
  description: string;
  keyed: boolean;
  input: z.ZodRawShape;
  // signal fires at the tool call's deadline; pass it to every request
  run: (session: Session, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  keyed: boolean;
  input: S;
  run: (session: Session, args: z.infer<z.ZodObject<S>>, signal: AbortSignal) => Promise<unknown>;
}): ToolDef {
  return def as unknown as ToolDef;
}
