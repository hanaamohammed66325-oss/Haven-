// ---------------------------------------------------------------------------
// Send only the newest snapshot, one request at a time.
//
// A snapshot pushed while a request is in flight waits for it, and replaces any
// snapshot still waiting, so an older state can never land after a newer one.
// A failed send is retried after each delay in `retryDelays`; when they run
// out, the snapshot is kept until the next push or retry() (e.g. when the
// connection comes back). `send` resolves true when done (or there was nothing
// to do) and false to retry; a throw counts as false.
// ---------------------------------------------------------------------------

export interface LatestSync<T> {
  push: (value: T) => void;
  /** Try the waiting snapshot again now, if there is one and nothing is running. */
  retry: () => void;
}

export function latestSync<T>(
  send: (value: T) => Promise<boolean>,
  retryDelays: number[] = [2_000, 5_000, 15_000, 60_000, 300_000],
): LatestSync<T> {
  let wanted: { value: T } | null = null;
  let running = false;

  const run = async () => {
    running = true;
    let failures = 0;
    try {
      while (wanted) {
        const w = wanted;
        let ok = false;
        try {
          ok = await send(w.value);
        } catch {
          ok = false;
        }
        if (ok) {
          failures = 0;
          if (wanted === w) wanted = null;
          continue;
        }
        if (failures >= retryDelays.length) break;
        await new Promise((r) => setTimeout(r, retryDelays[failures++]));
      }
    } finally {
      running = false;
    }
  };

  return {
    push: (value: T) => {
      wanted = { value };
      if (!running) void run();
    },
    retry: () => {
      if (wanted && !running) void run();
    },
  };
}
