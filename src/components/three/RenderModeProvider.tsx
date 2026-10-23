"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { measureFrameRate } from "@/lib/fps";
import { createRenderModeStore, type RenderModeStore } from "./render-mode-store";
import type { FallbackReason, RenderMode, ResolvedMode } from "@/lib/scene-mode";

/**
 * Render-mode context: the single source of truth for whether the app draws 3D.
 *
 * Two phases matter here, and conflating them is the usual bug:
 *
 * 1. **Before hydration** the server has no idea what the device can do, so the
 *    snapshot is always 2D. The 2D board is what gets server-rendered and what
 *    ends up in the HTML, so a crawler or a JS-disabled visitor always gets the
 *    real content. 3D is then an upgrade *on top of* that, never a prerequisite.
 *
 * 2. **After hydration** detection runs and may promote to 3D. Detection reads
 *    `localStorage`, `matchMedia`, navigator hints and a WebGL context — none of
 *    which exist on the server — so it can only happen in an effect. Doing it
 *    during render is what produces hydration mismatches.
 *
 * The value lives in a store built below, read through `useSyncExternalStore`.
 * That is the supported way to read an external system, and it keeps capability
 * detection out of a `setState` inside an effect body, which React rightly flags
 * as a cascading render. The store is deliberately per-provider rather than a
 * module singleton — see `./render-mode-store` for the hydration bug that a
 * singleton causes.
 */

type RenderModeContextValue = {
  /** The stored preference: auto, or an explicit choice. */
  mode: RenderMode;
  /** What is actually being drawn, once policy and detection have been applied. */
  resolved: ResolvedMode;
  /** Why 3D is not running, when it is not. */
  reason: FallbackReason | null;
  /** Whether decorative motion should run (false under reduced motion). */
  animate: boolean;
  /** True once client-side detection has finished. */
  ready: boolean;
  /** Explicitly choose a mode; clears any automatic demotion. */
  choose: (mode: RenderMode) => void;
};

const RenderModeContext = createContext<RenderModeContextValue | null>(null);

/** How long to wait after mounting before the frame-rate probe starts. */
const PROBE_DELAY_MS = 1400;

export function RenderModeProvider({ children }: { children: ReactNode }) {
  /**
   * One store for this provider's lifetime.
   *
   * The lazy initializer runs once per mount and hands the *value* back, so
   * `store` is ordinary render input — unlike a ref, whose `current` must not be
   * read during render. Creating it during render is safe because the store's
   * initial value is the server snapshot: nothing reads a browser global until
   * `detect()` is called from an effect below.
   */
  const [store] = useState<RenderModeStore>(createRenderModeStore);

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  /**
   * Run detection once, after mount.
   *
   * Every read inside touches a browser global, which is why it cannot happen
   * during render. This effect only *writes to an external system* — the store —
   * and the snapshot comparison above is what re-renders.
   */
  useEffect(() => {
    store.detect();
  }, [store]);

  /**
   * The frame-rate probe.
   *
   * Deliberately skipped when the visitor has already chosen a mode: an explicit
   * `3d` should not be second-guessed by a measurement, and an explicit `2d` has
   * nothing to demote.
   */
  useEffect(() => {
    if (!snapshot.ready) return;
    if (snapshot.mode !== "auto") return;
    if (snapshot.resolved !== "3d") return;

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      const verdict = await measureFrameRate();
      if (cancelled || verdict.smooth) return;
      store.demoteForFrameRate();
    }, PROBE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [store, snapshot.ready, snapshot.mode, snapshot.resolved]);

  const value = useMemo<RenderModeContextValue>(
    () => ({
      mode: snapshot.mode,
      resolved: snapshot.resolved,
      reason: snapshot.reason,
      animate: snapshot.animate,
      ready: snapshot.ready,
      choose: store.choose,
    }),
    [store, snapshot],
  );

  return (
    <RenderModeContext.Provider value={value}>
      {children}
    </RenderModeContext.Provider>
  );
}

/**
 * Read the render mode.
 *
 * Throws outside a provider rather than silently defaulting, because a scene
 * that quietly falls back to 2D is far harder to diagnose than one that fails
 * loudly at mount.
 */
export function useRenderMode(): RenderModeContextValue {
  const value = useContext(RenderModeContext);
  if (value === null) {
    throw new Error("useRenderMode must be used within a RenderModeProvider");
  }
  return value;
}
