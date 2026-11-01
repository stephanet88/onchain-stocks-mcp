import type { Variant } from "./tokens.ts";

const ISSUER_BY_LABEL: Record<string, string> = { xStock: "Backed (xStock)" };

export function issuerName(variant: Variant, symbol: string | undefined): string {
  if (variant.issuer) return variant.issuer === "Backed" ? "Backed (xStock)" : variant.issuer;
  const mapped = variant.label ? ISSUER_BY_LABEL[variant.label] : undefined;
  if (mapped) return mapped;
  // without an issuer field the name often carries it after the last " - ": "Apple - Backpack Securities"
  const dash = variant.name?.lastIndexOf(" - ") ?? -1;
  const fromName = dash > 0 ? variant.name?.slice(dash + 3).trim() : undefined;
  if (fromName) return fromName;
  // some variants carry only the ticker as label, which says nothing about who issued them
  if (variant.label && variant.label.toLowerCase() !== symbol?.toLowerCase()) return variant.label;
  return "unknown";
}
