# stockscope-mcp

MCP server for tokenized stocks on Solana: what a buy really costs against the real share price.

Read-only. It never trades, holds keys or gives advice.

## Tools

| Tool | Returns |
|---|---|
| `search_stocks` | Tokens for a stock: issuer, redeemability, liquidity, listed price, plus the real share price and its age |
| `quote_buy` | Price paid per token for a USDC buy (Jupiter quote, not a fill) and the all-in cost vs the share. Mint must come from a search |
| `risk_score` | Market risk score 0 to 100, grade A/B/C, from tokens.xyz |

Share prices are frozen outside US trading hours. Check `sharePriceAgeMinutes` before comparing.

## Setup

Needs Node 26+ and a [tokens.xyz](https://tokens.xyz) API key.

```
git clone https://github.com/stephanet88/stockscope-mcp
cd stockscope-mcp
npm install
```

Claude Code:

```
claude mcp add stockscope -e TOKENS_API_KEY=your_key -- node /path/to/stockscope-mcp/src/mcp.ts
```

Other clients (Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "stockscope": {
      "command": "node",
      "args": ["/path/to/stockscope-mcp/src/mcp.ts"],
      "env": { "TOKENS_API_KEY": "your_key" }
    }
  }
}
```

Then ask: "What does a $10k buy of tokenized Tesla cost vs the real share?"

## Data sources

| Data | Source |
|---|---|
| Tokens, share prices, risk | api.tokens.xyz/v1 |
| Buy quotes | Jupiter lite API (free, rate-limited: errors are returned, never guessed) |

## Tests

```
npm test
```

Not investment advice.
