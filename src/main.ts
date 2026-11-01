#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { quoteBuy } from "./jupiter.ts";
import { createServer } from "./mcp.ts";
import { riskSummary, searchStocks } from "./tokens.ts";

const apiKey = process.env.TOKENS_API_KEY;
const keyless = { quote: (mint: string, usd: number) => quoteBuy(mint, usd), now: () => Date.now() };
// stdout is the MCP channel, so notices go to stderr
if (!apiKey) console.error("onchain-stocks-mcp: no TOKENS_API_KEY, keyless mode (list_tokens, quote_sizes, compare_issuers)");
const server = createServer(
  apiKey
    ? { ...keyless, search: (query) => searchStocks(apiKey, query), risk: (mint) => riskSummary(apiKey, mint) }
    : keyless,
);
await server.connect(new StdioServerTransport());
