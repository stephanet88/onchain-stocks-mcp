import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { quoteBuy } from "./jupiter.ts";
import { riskSummary, searchStocks } from "./tokens.ts";
import { MAX_BUY_USD, TOOL_SPECS, Tools, type Sources } from "./tools.ts";

const INSTRUCTIONS =
  "Read-only data on tokenized stocks on Solana. Quotes are Jupiter quotes, not fills. Share prices are frozen outside US trading hours: check sharePriceAgeMinutes. Never present results as investment advice.";

type ToolName = (typeof TOOL_SPECS)[number]["function"]["name"];

const INPUTS: Record<ToolName, z.ZodRawShape> = {
  search_stocks: { query: z.string().describe("Company name or ticker, e.g. Tesla or NVDA") },
  quote_buy: { mint: z.string(), usd: z.number().describe(`Amount of USDC, 1 to ${MAX_BUY_USD}`) },
  risk_score: { mint: z.string() },
};

// one server per client connection, so the mints a search returned stay scoped to that client
export function createServer(sources: Sources): McpServer {
  const server = new McpServer({ name: "stockscope", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const tools = new Tools(sources);
  for (const { function: spec } of TOOL_SPECS) {
    const name = spec.name;
    server.registerTool(
      name,
      { description: spec.description, inputSchema: INPUTS[name], annotations: { readOnlyHint: true, openWorldHint: true } },
      async (args: Record<string, unknown>) => {
        const result = await tools.call(name, JSON.stringify(args));
        const isError = typeof result === "object" && result !== null && "error" in result;
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError };
      },
    );
  }
  return server;
}

async function main() {
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
}

if (import.meta.main) await main();
