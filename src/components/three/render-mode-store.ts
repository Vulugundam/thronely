"use client";

import {
  decideRenderMode,
  fallbackReasonFor,
  isLowPowerDevice,
  prefersReducedMotion,
  readFpsDemoted,
  readRenderMode,
  supportsWebGL,
  writeFpsDemoted,
  writeRenderMode,
  type FallbackReason,
  type RenderMode,
  type ResolvedMode,
} from "@/lib/scene-mode";

/**
 * The render mode as a small external store.
 *
 * This exists for one reason: browser capability is an *external system*, and
 * React's answer to reading one is `useSyncExternalStore`, not a `useState` that
 * an effect pokes from inside its own body. Doing it the other way round — the
 * obvious way — trips `react-hooks/set-state-in-effect`, and the rule is right:
 * setting state synchronously in an effect body schedules a second render on top
 * of the one that just committed, and the only thing it buys is having read a
 * global somewhere it should not have been read.
 *
 * **The store is created per provider instance, never as a module singleton.**
 * That is not a style preference; a singleton here causes a real hydration bug.
 * React calls `getServerSnapshot` on the client during hydration so the first
 * client render matches the HTML. A shared module-level value can be written
 * before that happens — a Fast Refresh re-render in development, a module
 * preserved across a client-side navigation — and the client then hydrates
 * `ready: true` against server HTML that was rendered `ready: false`. React
 * reports exactly that as "Hydration failed because the server rendered HTML
 * didn't match the client". An instance-scoped store cannot do this: its value
 * starts as the server snapshot and is only ever written after mount.
 *
 * The policy itself stays in `./scene-mode`, pure and tested. This file only
 * gathers the signals and holds the answer.
 */

export type RenderModeSnapshot = {
  /** The visitor's stored preference: auto, or an explicit choice. */
  mode: RenderMode;
  /** What is actually being drawn, once policy and detection have been applied. */
  resolved: ResolvedMode;
  /** Why 3D is not running, when it is not. */
  reason: FallbackReason | null;
  /** Whether decorative motion should run (false under reduced motion). */
  animate: boolean;
  /** True once client-side detection has finished. */
  ready: boolean;
};

/**
 * What the server renders, and what the first client render must agree with.
 *
 * Always 2D. The server cannot know what the device can do, and guessing 3D
 * would put markup in the HTML that the client's first paint contradicts — a
 * hydration mismatch. 2D is also the rendering that is genuinely fine to send
 * to everyone: it is the accessible, crawlable one. 3D is an upgrade applied on
 * top of it, never a prerequisite for it.
 *
 * Frozen, and shared by every store: it is a constant, and handing out the same
 * object means `useSyncExternalStore`'s identity check is trivially stable.
 */
const SERVER_SNAPSHOT: RenderModeSnapshot = Object.freeze({
  mode: "auto",
  resolved: "2d",
  reason: null,
  animate: false,
  ready: false,
});

export type RenderModeStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RenderModeSnapshot;
  getServerSnapshot: () => RenderModeSnapshot;
  /** Run capability detection. Idempotent; call once after mount. */
  detect: () => void;
  /** Set an explicit preference, clearing any automatic demotion. */
  choose: (mode: RenderMode) => void;
  /** Record that the frame-rate probe demoted this browser. */
  demoteForFrameRate: () => void;
};

/** Read every signal and apply the policy. Only ever called in the browser. */
function resolveFrom(browser: {
  mode?: RenderMode;
  fpsDemoted?: boolean;
}): RenderModeSnapshot {
  const mode = browser.mode ?? readRenderMode();

  const signals = {
    prefersReducedMotion: prefersReducedMotion(),
    supportsWebGL: supportsWebGL(),
    lowPower: isLowPowerDevice(),
    fpsDemoted: browser.fpsDemoted ?? readFpsDemoted(),
  };

  return {
    mode,
    resolved: decideRenderMode(mode, signals),
    // Only the automatic path has a reason to explain. An explicit choice is its
    // own explanation, and telling someone "your system asks for reduced motion"
    // when they deliberately picked 2D from the toggle would be noise.
    reason: mode === "auto" ? fallbackReasonFor(signals) : null,
    animate: !signals.prefersReducedMotion,
    ready: true,
  };
}

/**
 * Build a store. One per provider instance — see the note at the top of the file
 * for why this must not be hoisted to a module-level singleton.
 */
export function createRenderModeStore(): RenderModeStore {
  /**
   * Kept in the closure rather than module scope, so two providers — or two
   * mounts of the same provider — can never see each other's value.
   *
   * `getSnapshot` must return a referentially stable value between changes,
   * because React compares snapshots by identity to decide whether to re-render.
   * The object is therefore replaced only when something actually changes,
   * never rebuilt per call.
   */
  let snapshot: RenderModeSnapshot = SERVER_SNAPSHOT;
  const listeners = new Set<() => void>();

  const publish = (next: RenderModeSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return snapshot;
    },

    getServerSnapshot() {
      return SERVER_SNAPSHOT;
    },

    detect() {
      publish(resolveFrom({}));
    },

    /**
     * A human decision outranks the automatic probe, so choosing clears the
     * demotion flag. Without that, picking 3D again would re-read `fpsDemoted`,
     * instantly demote, and leave no way back short of clearing site data.
     */
    choose(mode) {
      writeRenderMode(mode);
      if (mode !== "auto") writeFpsDemoted(false);
      publish(resolveFrom({ mode, fpsDemoted: false }));
    },

    demoteForFrameRate() {
      // The probe only runs on the automatic path — an explicit `3d` is not
      // second-guessed — so a late demotion must not overwrite a choice that
      // landed while the probe was still measuring.
      if (snapshot.mode !== "auto") return;

      writeFpsDemoted(true);
      publish({ ...snapshot, resolved: "2d", reason: "fps" });
    },
  };
}
