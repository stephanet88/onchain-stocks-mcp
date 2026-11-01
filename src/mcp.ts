import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KEYED_TOOLS, MAX_BUY_USD, TOOL_SPECS, Tools, type Sources } from "./tools.ts";

const INSTRUCTIONS =
  "Read-only data on tokenized stocks on Solana. Quotes are Jupiter quotes, not fills. Share prices are frozen outside US trading hours: check sharePriceAgeMinutes. Never present results as investment advice.";

type ToolName = (typeof TOOL_SPECS)[number]["function"]["name"];

const INPUTS: Record<ToolName, z.ZodRawShape> = {
  search_stocks: { query: z.string().describe("Company name or ticker, e.g. Tesla or NVDA") },
  quote_buy: { mint: z.string(), usd: z.number().describe(`Amount of USDC, 1 to ${MAX_BUY_USD}`) },
  risk_score: { mint: z.string() },
  list_tokens: { query: z.string().optional().describe("Ticker or company name, e.g. TSLA or Nvidia") },
  quote_sizes: { mint: z.string(), sizes: z.array(z.number()).optional().describe("Up to 5 USDC amounts, default 1000, 10000, 50000") },
  compare_issuers: { symbol: z.string().describe("Ticker, e.g. TSLA"), usd: z.number().optional().describe(`Amount of USDC, 1 to ${MAX_BUY_USD}, default 1000`) },
};

// one server per client connection, so the mints a search returned stay scoped to that client
export function createServer(sources: Sources): McpServer {
  const server = new McpServer({ name: "onchain-stocks", version: "0.2.0" }, { instructions: INSTRUCTIONS });
  const tools = new Tools(sources);
  const keyed = sources.search != null && sources.risk != null;
  for (const { function: spec } of TOOL_SPECS) {
    const name = spec.name;
    if (!keyed && KEYED_TOOLS.includes(name)) continue;
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
