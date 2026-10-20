/**
 * Run `worker` on each input with at most `limit` in flight at once. Preserves
 * input order in the output so callers can zip results back to inputs.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}
