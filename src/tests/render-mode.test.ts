import { describe, expect, it } from "vitest";
import {
  decideRenderMode,
  fallbackReasonFor,
  MIN_SMOOTH_FPS,
  type RenderSignals,
} from "@/lib/scene-mode";
import { judgeFrames, measureFrameRate } from "@/lib/fps";

/**
 * The render-mode policy and the frame-rate verdict, both pure by construction.
 *
 * Nothing here touches a WebGL context or a real animation frame: the policy
 * takes four booleans and the probe takes an array of deltas, which is exactly
 * why they were split that way. Stubbing a WebGL context would be a mock of a
 * mock and would prove nothing about the decision being made.
 */

/** A capable machine with no stated preference: the 3D happy path. */
const CAPABLE: RenderSignals = {
  prefersReducedMotion: false,
  supportsWebGL: true,
  lowPower: false,
  fpsDemoted: false,
};

describe("decideRenderMode", () => {
  it("renders 3D automatically when nothing argues against it", () => {
    expect(decideRenderMode("auto", CAPABLE)).toBe("3d");
  });

  it("honours an explicit 2D choice even on a capable machine", () => {
    expect(decideRenderMode("2d", CAPABLE)).toBe("2d");
  });

  it.each([
    ["reduced motion", { prefersReducedMotion: true }],
    ["a low-power device", { lowPower: true }],
    ["a failed frame-rate probe", { fpsDemoted: true }],
  ])("falls back to 2D on %s", (_label, override) => {
    expect(decideRenderMode("auto", { ...CAPABLE, ...override })).toBe("2d");
  });

  it.each([
    ["reduced motion", { prefersReducedMotion: true }],
    ["a low-power device", { lowPower: true }],
    ["a failed frame-rate probe", { fpsDemoted: true }],
  ])("lets an explicit 3D choice override %s", (_label, override) => {
    expect(decideRenderMode("3d", { ...CAPABLE, ...override })).toBe("3d");
  });

  /*
   * The one reason an explicit choice cannot override. A browser without WebGL
   * cannot create the context the scene draws into, so honouring "3d" here would
   * mount a canvas that renders nothing — worse than the 2D board it replaced.
   */
  it("refuses 3D without WebGL, however it was asked for", () => {
    const noWebGL = { ...CAPABLE, supportsWebGL: false };

    expect(decideRenderMode("auto", noWebGL)).toBe("2d");
    expect(decideRenderMode("3d", noWebGL)).toBe("2d");
  });

  it("does not let reduced motion reach 3D through the auto path", () => {
    // Guards the ordering: if `fallbackReasonFor` ever stopped reporting reduced
    // motion, auto would silently promote an accessibility preference to 3D.
    expect(
      fallbackReasonFor({ ...CAPABLE, prefersReducedMotion: true }),
    ).toBe("reduced-motion");
  });
});

describe("fallbackReasonFor", () => {
  it("reports no reason when 3D is clear to run", () => {
    expect(fallbackReasonFor(CAPABLE)).toBeNull();
  });

  /*
   * Ordering is part of the contract: the toggle shows the first reason, and
   * "this browser cannot do 3D at all" is more useful to a visitor than "your
   * core count is low". With several true at once, the most fundamental wins.
   */
  it("reports no-webgl ahead of every other reason", () => {
    expect(
      fallbackReasonFor({
        supportsWebGL: false,
        prefersReducedMotion: true,
        lowPower: true,
        fpsDemoted: true,
      }),
    ).toBe("no-webgl");
  });

  it("reports reduced-motion ahead of low-power and fps", () => {
    expect(
      fallbackReasonFor({
        supportsWebGL: true,
        prefersReducedMotion: true,
        lowPower: true,
        fpsDemoted: true,
      }),
    ).toBe("reduced-motion");
  });

  it("reports low-power ahead of fps", () => {
    expect(
      fallbackReasonFor({
        supportsWebGL: true,
        prefersReducedMotion: false,
        lowPower: true,
        fpsDemoted: true,
      }),
    ).toBe("low-power");
  });

  it("reports fps as the last resort", () => {
    expect(
      fallbackReasonFor({
        supportsWebGL: true,
        prefersReducedMotion: false,
        lowPower: false,
        fpsDemoted: true,
      }),
    ).toBe("fps");
  });
});

describe("judgeFrames", () => {
  /** 60fps: every delta comfortably under the 20ms slow-frame threshold. */
  const smoothFrames = (count: number) => Array.from({ length: count }, () => 16.7);

  it("judges a stream of 60fps frames smooth", () => {
    const verdict = judgeFrames(smoothFrames(120));

    expect(verdict.smooth).toBe(true);
    expect(verdict.frameCount).toBe(120);
    expect(verdict.medianFrameMs).toBeCloseTo(16.7, 5);
    expect(verdict.fps).toBeCloseTo(59.88, 1);
  });

  /*
   * The counter-intuitive case worth pinning down: a window that recorded no
   * frames at all is the *best* outcome, not a missing measurement. Reading it as
   * "no data, demote" would fail every context that cannot be measured.
   */
  it("judges an empty sample smooth rather than unknown", () => {
    const verdict = judgeFrames([]);

    expect(verdict.smooth).toBe(true);
    expect(verdict.medianFrameMs).toBe(Number.POSITIVE_INFINITY);
    expect(verdict.frameCount).toBe(0);
  });

  it("demotes a sustained 20fps — 50ms frames", () => {
    const verdict = judgeFrames(Array.from({ length: 40 }, () => 50));

    expect(verdict.smooth).toBe(false);
    expect(verdict.medianFrameMs).toBe(50);
    expect(verdict.fps).toBe(20);
  });

  it("keeps a machine whose frame rate sits exactly on the threshold", () => {
    // 1000 / MIN_SMOOTH_FPS is the break-even delta; the boundary is inclusive.
    const onThreshold = 1000 / MIN_SMOOTH_FPS;
    const verdict = judgeFrames(Array.from({ length: 40 }, () => onThreshold));

    expect(verdict.fps).toBeCloseTo(MIN_SMOOTH_FPS, 6);
    expect(verdict.smooth).toBe(true);
  });

  it("demotes a machine just over the threshold", () => {
    const justOver = 1000 / MIN_SMOOTH_FPS + 1;
    const verdict = judgeFrames(Array.from({ length: 40 }, () => justOver));

    expect(verdict.smooth).toBe(false);
  });

  /*
   * Why the verdict is the median of the *whole* window and not of the slow
   * frames alone. An earlier version filtered to frames over the threshold before
   * taking the median, which left only the bad frames in the sample — so three
   * catastrophic frames out of 200 decided the result by themselves and demoted a
   * machine running at 60fps. A handful of outliers is not evidence of a slow
   * device, and the full window is what lets the median say so.
   */
  it("ignores a few catastrophic frames on an otherwise fast run", () => {
    const deltas = [...smoothFrames(197), 4000, 3000, 2500];
    const verdict = judgeFrames(deltas);

    expect(verdict.smooth).toBe(true);
    expect(verdict.frameCount).toBe(200);
    expect(verdict.medianFrameMs).toBeCloseTo(16.7, 5);

    // The mean, by contrast, is dragged to under 13fps — which is what the
    // median is here to prevent.
    const mean = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
    expect(1000 / mean).toBeLessThan(MIN_SMOOTH_FPS);
  });

  it("reports the median of the window, not the worst frame", () => {
    // Three catastrophic frames among many fast ones: the median is still 16.7ms.
    const verdict = judgeFrames([16.7, 16.7, 30, 16.7, 16.7, 40, 16.7, 16.7, 5000]);

    expect(verdict.frameCount).toBe(9);
    expect(verdict.medianFrameMs).toBe(16.7);
    expect(verdict.smooth).toBe(true);
  });

  /*
   * The other direction: when slow frames are the majority, the median must
   * report that rather than being rescued by a few fast ones.
   */
  it("demotes when slow frames are the prevailing case", () => {
    const verdict = judgeFrames([16.7, 16.7, 45, 48, 52, 60, 70]);

    expect(verdict.smooth).toBe(false);
    expect(verdict.medianFrameMs).toBe(48);
  });

  it("takes the middle value when the frame count is odd", () => {
    expect(judgeFrames([21, 22, 23]).medianFrameMs).toBe(22);
  });

  it("averages the two middle values when the frame count is even", () => {
    expect(judgeFrames([21, 22, 23, 24]).medianFrameMs).toBe(22.5);
  });

  it("does not care what order the deltas arrive in", () => {
    const ascending = judgeFrames([10, 20, 30, 40, 50]);
    const shuffled = judgeFrames([40, 10, 50, 20, 30]);

    expect(shuffled.medianFrameMs).toBe(ascending.medianFrameMs);
    expect(shuffled.fps).toBe(ascending.fps);
  });

  /*
   * A stalled compositor can deliver a burst larger than any plausible two-second
   * window, so the sort is bounded rather than trusting the clock. The cap is
   * applied to the head of the array, so a burst at the start cannot be diluted
   * by an otherwise-smooth tail — the opening frames are the ones that include
   * shader compilation.
   */
  it("caps the sample it sorts at 512 frames", () => {
    const burst = [
      ...Array.from({ length: 600 }, () => 4000),
      ...Array.from({ length: 600 }, () => 16.7),
    ];

    const verdict = judgeFrames(burst);

    expect(verdict.frameCount).toBe(512);
    expect(verdict.smooth).toBe(false);
  });
});

describe("measureFrameRate", () => {
  /*
   * These tests run in the node environment, which is the case being asserted:
   * with no rAF to call, the probe must resolve smooth rather than hang or
   * demote. Demoting here would strand every server-side or rAF-less context on
   * the 2D board purely because it could not be measured.
   */
  it("resolves smooth when there is no animation frame to measure", async () => {
    expect(typeof window).toBe("undefined");

    const verdict = await measureFrameRate(10);

    expect(verdict.smooth).toBe(true);
    expect(verdict.frameCount).toBe(0);
  });
});
