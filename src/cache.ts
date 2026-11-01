const MAX_ENTRIES = 1_000;

// identical calls inside the window share one request: agents repeat questions and Jupiter's free API rate-limits
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: (...args: A) => string,
  ttlMs: number,
  now: () => number = Date.now,
): (...args: A) => Promise<R> {
  const entries = new Map<string, { at: number; value: Promise<R> }>();
  return (...args) => {
    const k = key(...args);
    const hit = entries.get(k);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    if (entries.size >= MAX_ENTRIES) {
      for (const [k, e] of entries) if (now() - e.at >= ttlMs) entries.delete(k);
      if (entries.size >= MAX_ENTRIES) entries.clear();
    }
    const value = fn(...args);
    const entry = { at: now(), value };
    entries.set(k, entry);
    // a failure is not cached, so the next call retries
    value.catch(() => {
      if (entries.get(k) === entry) entries.delete(k);
    });
    return value;
  };
}
