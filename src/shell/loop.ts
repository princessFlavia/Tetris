// Cap per-frame delta so a long stall (e.g. a backgrounded tab) can't trigger
// a burst of catch-up gravity ticks when the frame loop resumes.
const MAX_FRAME_DELTA_MS = 250;

/** Calls onFrame every animation frame with elapsed ms. Returns a stop function. */
export function startLoop(onFrame: (deltaMs: number) => void): () => void {
  let previous: number | null = null;
  let handle = 0;

  const frame = (now: number): void => {
    const delta = previous === null ? 0 : Math.min(now - previous, MAX_FRAME_DELTA_MS);
    previous = now;
    onFrame(delta);
    handle = requestAnimationFrame(frame);
  };

  handle = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(handle);
}
