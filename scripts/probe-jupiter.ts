// One-off: how hard does Jupiter's free quote API push back? Sends N quotes back to back, no retries.
// Usage: node scripts/probe-jupiter.ts [count] [delayMs]   Keep it small: this is a shared free service.
import { USDC_MINT } from "../src/jupiter.ts";

const TSLA_XSTOCK = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const count = Number(process.argv[2] ?? 60);
const delayMs = Number(process.argv[3] ?? 0);
const latencies: number[] = [];
const statuses = new Map<number, number>();
const started = Date.now();
for (let i = 0; i < count; i += 1) {
  const t = Date.now();
  const res = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${USDC_MINT}&outputMint=${TSLA_XSTOCK}&amount=${(1_000 + i) * 1e6}&slippageBps=100`, {
    signal: AbortSignal.timeout(10_000),
  });
  await res.arrayBuffer();
  latencies.push(Date.now() - t);
  statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
const seconds = (Date.now() - started) / 1000;
console.log(`${count} requests in ${seconds.toFixed(1)} s (${(count / seconds).toFixed(1)}/s)`);
console.log(`status counts: ${JSON.stringify(Object.fromEntries(statuses))}`);
console.log(`latency p50 ${pct(50)} ms, p95 ${pct(95)} ms, max ${latencies.at(-1)} ms`);
