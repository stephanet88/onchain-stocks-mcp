# onchain-stocks-mcp

MCP server for tokenized stocks on Solana: what a buy really costs against the real share price.

Read-only. It never trades, holds keys or gives advice.

![Demo: a $1,000 tokenized Tesla buy quoted at -0.07% vs the real share](demo.gif)

## Tools

| Tool | Returns |
|---|---|
| `search_stocks` | Tokens for a stock: issuer, redeemability, liquidity, listed price, plus the real share price and its age |
| `quote_buy` | Price paid per token for a USDC buy (Jupiter quote, not a fill) and the all-in cost vs the share. Mint must come from a search |
| `risk_score` | Market risk score 0 to 100, grade A/B/C, from tokens.xyz |

Share prices are frozen outside US trading hours. Check `sharePriceAgeMinutes` before comparing.

## Setup

Needs Node 22+ and a [tokens.xyz](https://tokens.xyz) API key.

Claude Code:

```
claude mcp add onchain-stocks -e TOKENS_API_KEY=your_key -- npx -y onchain-stocks-mcp
```

Other clients (Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "onchain-stocks": {
      "command": "npx",
      "args": ["-y", "onchain-stocks-mcp"],
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

## Development

```
git clone https://github.com/stephanet88/onchain-stocks-mcp
cd onchain-stocks-mcp
npm install   # also builds dist/
npm test
npm run lint
npm run typecheck
```

Not investment advice.
