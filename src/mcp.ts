import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Session } from "./session.ts";
import type { Sources } from "./types.ts";

const INSTRUCTIONS =
  "Read-only data on tokenized stocks on Solana. Quotes are Jupiter quotes, not fills. Share prices are frozen outside US trading hours: check sharePriceAgeMinutes. Never present results as investment advice.";

export function createServer(sources: Sources): McpServer {
  const server = new McpServer({ name: "onchain-stocks", version: "0.3.3" }, { instructions: INSTRUCTIONS });
  const session = new Session(sources);
  for (const tool of session.tools()) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input, annotations: { readOnlyHint: true, openWorldHint: true } },
      async (args: Record<string, unknown>) => {
        const result = await session.call(tool.name, args);
        const isError = typeof result === "object" && result !== null && "error" in result;
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError };
      },
    );
  }
  return server;
}
