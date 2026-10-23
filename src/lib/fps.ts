import { MIN_SMOOTH_FPS } from "./scene-mode";

/**
 * A short frame-rate probe.
 *
 * Device capability heuristics answer "should this device struggle?" This
 * answers "is this device actually struggling, right now?" — which is the only
 * way to catch the case heuristics miss: a capable laptop whose GPU is busy, a
 * browser falling back to software rendering, or a page with many live canvases.
 *
 * The verdict is the **median of every frame in the window**, and both halves of
 * that matter:
 *
 * - *Median, not mean.* The mean of a 60fps run containing three 4-second frames
 *   is ~84ms, which is under 12fps — a demotion for a machine that was never
 *   slow. The outlier is a tab regaining focus or the compositor doing something
 *   else, not evidence about the device. A median ignores a handful of such
 *   frames by construction, so the verdict tracks sustained smoothness.
 *
 * - *Every frame, not just the slow ones.* Filtering to frames over the
 *   threshold before taking the median looks like it prunes noise, but it
 *   inverts the whole idea: with only slow frames left in the sample, the median
 *   *cannot* dilute them, so three bad frames out of two hundred decide the
 *   result on their own. The full window is what makes the median robust.
 *
 * The window is two seconds, so the array is a couple of hundred numbers even at
 * 120fps. Recording all of them is cheaper than any cleverness about which to
 * keep.
 */

/** How long to watch before deciding. */
export const PROBE_DURATION_MS = 2000;

/**
 * Upper bound on the sample.
 *
 * Unreachable in a two-second window — clearing it would take 256fps — but the
 * array is fed by a timer and a stalled compositor can deliver a burst, so the
 * sort stays bounded rather than trusting the clock.
 */
const MAX_SAMPLES = 512;

export type FpsVerdict = {
  /** Median frame time across the window, in ms. Infinity when nothing was measured. */
  medianFrameMs: number;
  /** The median frame rate, derived from it. Zero when nothing was measured. */
  fps: number;
  /** Frames examined. */
  frameCount: number;
  /** Whether 3D is judged to be holding up. */
  smooth: boolean;
};

/** The median of a numerically-sorted, non-empty array. */
function medianOf(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Decide from raw frame deltas. Pure, so the thresholds are testable without rAF.
 *
 * Returns `smooth: true` when nothing was measured at all: a probe that saw no
 * frames is the *best* outcome, not a missing one, and demoting on it would
 * strand every context that cannot be measured.
 */
export function judgeFrames(deltas: readonly number[]): FpsVerdict {
  const window = deltas.length > MAX_SAMPLES ? deltas.slice(0, MAX_SAMPLES) : deltas;
  const sorted = [...window].sort((a, b) => a - b);

  if (sorted.length === 0) {
    return {
      medianFrameMs: Number.POSITIVE_INFINITY,
      fps: 0,
      frameCount: 0,
      smooth: true,
    };
  }

  const medianFrameMs = medianOf(sorted);
  const fps = 1000 / medianFrameMs;

  return {
    medianFrameMs,
    fps,
    frameCount: window.length,
    smooth: fps >= MIN_SMOOTH_FPS,
  };
}

/**
 * Watch the compositor for a fixed window and judge the result.
 *
 * Resolves with `smooth: true` on a machine that never fires rAF at all — a
 * background tab, or reduced motion suppressing the loop. Neither is evidence
 * of a weak device, and demoting on it would be a guess. The same applies to a
 * tab that is hidden when the window closes: its frames were throttled by the
 * browser's background policy, which says nothing about the GPU.
 */
export function measureFrameRate(
  durationMs: number = PROBE_DURATION_MS,
): Promise<FpsVerdict> {
  const unmeasured: FpsVerdict = {
    medianFrameMs: Number.POSITIVE_INFINITY,
    fps: 0,
    frameCount: 0,
    smooth: true,
  };

  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve(unmeasured);
  }

  return new Promise((resolve) => {
    const deltas: number[] = [];
    let start: number | null = null;
    let previous: number | null = null;

    const tick = (now: number) => {
      if (start === null) start = now;
      if (previous !== null) deltas.push(now - previous);
      previous = now;

      if (now - start < durationMs) {
        window.requestAnimationFrame(tick);
        return;
      }

      // A window spent hidden is a window the browser throttled on purpose.
      if (typeof document !== "undefined" && document.hidden) {
        resolve(unmeasured);
        return;
      }

      resolve(judgeFrames(deltas));
    };

    window.requestAnimationFrame(tick);
  });
}
