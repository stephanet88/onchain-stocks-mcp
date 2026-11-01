#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { quoteBuy } from "./jupiter.ts";
import { createServer } from "./mcp.ts";
import { riskSummary, searchStocks } from "./tokens.ts";

const apiKey = process.env.TOKENS_API_KEY;
if (!apiKey) {
  console.error("TOKENS_API_KEY is not set: get a key at tokens.xyz and pass it in your MCP client config");
  process.exit(1);
}
const server = createServer({
  search: (query) => searchStocks(apiKey, query),
  quote: (mint, usd) => quoteBuy(mint, usd),
  risk: (mint) => riskSummary(apiKey, mint),
  now: () => Date.now(),
});
await server.connect(new StdioServerTransport());
