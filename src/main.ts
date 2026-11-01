#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { cached } from "./cache.ts";
import { quoteBuy } from "./jupiter.ts";
import { createServer } from "./mcp.ts";
import { riskSummary, searchStocks } from "./tokens.ts";

const apiKey = process.env.TOKENS_API_KEY;
const QUOTE_TTL_MS = 15_000;
// keyed on mint and size only: the deadline signal belongs to whichever call started the request
const quote = cached((mint: string, usd: number, signal?: AbortSignal) => quoteBuy(mint, usd, signal), (mint, usd) => `${mint}:${usd}`, QUOTE_TTL_MS);
const keyless = { quote, now: () => Date.now() };
// stdout is the MCP channel, so notices go to stderr
if (!apiKey) console.error("onchain-stocks-mcp: no TOKENS_API_KEY, keyless mode (list_tokens, quote_sizes, compare_issuers)");
const server = createServer(
  apiKey
    ? { ...keyless, search: (query, signal) => searchStocks(apiKey, query, signal), risk: (mint, signal) => riskSummary(apiKey, mint, signal) }
    : keyless,
);
await server.connect(new StdioServerTransport());
