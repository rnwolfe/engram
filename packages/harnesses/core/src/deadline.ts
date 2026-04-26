const DEFAULT_DEADLINE_MS = 1500;

export function getDeadlineMs(): number {
  const env = process.env.ENGRAM_CONTEXT_DEADLINE_MS;
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_DEADLINE_MS;
}

export function withDeadline<T>(
  fn: () => Promise<T>,
  deadlineMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), deadlineMs);
    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}
