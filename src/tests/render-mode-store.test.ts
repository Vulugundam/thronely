import { describe, expect, it, vi } from "vitest";
import { createRenderModeStore } from "@/components/three/render-mode-store";

/**
 * The render-mode store.
 *
 * These run in the node environment, which is itself the case being pinned: with
 * no `window` at all, every capability probe answers "no", so the policy must
 * resolve to 2D with a `no-webgl` reason and still report `ready`. A store that
 * threw or hung server-side would break hydration, and that is precisely what
 * this file guards.
 *
 * Each case builds its own store, because that is what the provider does and
 * because it is what keeps these cases independent. A shared instance would let
 * one case's `choose` leak into the next, and — the reason the store is a
 * factory at all — a value written before React hydrates is the hydration bug
 * this design exists to prevent. There is no reset function on purpose: throwing
 * away the store is the reset.
 */
const newStore = () => createRenderModeStore();

describe("the server snapshot", () => {
  it("is 2D, unready, and carries no reason", () => {
    const server = newStore().getServerSnapshot();

    expect(server.resolved).toBe("2d");
    expect(server.mode).toBe("auto");
    expect(server.ready).toBe(false);
    expect(server.reason).toBeNull();
  });

  /*
   * React hydrates against the server snapshot and then compares. If the live
   * value had already drifted to 3D by then, every consumer would mismatch. The
   * two must agree until detection actually runs.
   */
  it("matches the live snapshot on a fresh store", () => {
    const store = newStore();

    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
  });

  it("keeps serving the server value after detection, for hydration", () => {
    const store = newStore();
    store.detect();

    expect(store.getServerSnapshot().ready).toBe(false);
    expect(store.getSnapshot().ready).toBe(true);
  });

  /*
   * The regression this whole file hangs off. A module-level store could be
   * written by one mount and then be the value a *second* mount hydrated
   * against, so `getSnapshot()` would already say `ready: true` where the server
   * HTML said `ready: false`. Two stores must never share a value.
   */
  it("does not leak a value between two stores", () => {
    const first = newStore();
    const second = newStore();

    first.detect();

    expect(first.getSnapshot().ready).toBe(true);
    expect(second.getSnapshot()).toBe(second.getServerSnapshot());
  });
});

describe("detect", () => {
  it("resolves to 2D with a no-webgl reason without a browser", () => {
    const store = newStore();
    store.detect();

    const snapshot = store.getSnapshot();

    // `supportsWebGL` is a hard requirement, so absent a DOM there is nothing to
    // draw into — and `no-webgl` is the honest thing to report, ahead of any
    // other signal.
    expect(snapshot.resolved).toBe("2d");
    expect(snapshot.reason).toBe("no-webgl");
  });

  it("marks itself ready", () => {
    const store = newStore();
    store.detect();

    expect(store.getSnapshot().ready).toBe(true);
  });

  it("enables motion when nothing asks for reduced motion", () => {
    const store = newStore();
    store.detect();

    expect(store.getSnapshot().animate).toBe(true);
  });

  it("notifies subscribers", () => {
    const store = newStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.detect();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is safe to run twice, as StrictMode will", () => {
    const store = newStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.detect();
    store.detect();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().ready).toBe(true);
  });
});

describe("subscribe", () => {
  it("stops notifying once unsubscribed", () => {
    const store = newStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.detect();

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies every subscriber", () => {
    const store = newStore();
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.detect();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  /*
   * `useSyncExternalStore` compares snapshots by identity to decide whether to
   * re-render. A getter that rebuilt the object each call would re-render every
   * consumer on every store notification forever.
   */
  it("returns a referentially stable snapshot between changes", () => {
    const store = newStore();
    store.detect();

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});

describe("choose", () => {
  it("records an explicit 2D choice", () => {
    const store = newStore();
    store.detect();
    store.choose("2d");

    const snapshot = store.getSnapshot();

    expect(snapshot.mode).toBe("2d");
    expect(snapshot.resolved).toBe("2d");
  });

  /*
   * A deliberate choice is its own explanation. Showing "your system asks for
   * reduced motion" to someone who just picked 2D from the toggle would be
   * telling them about a decision they already made.
   */
  it("reports no reason for an explicit choice", () => {
    const store = newStore();
    store.detect();
    store.choose("2d");

    expect(store.getSnapshot().reason).toBeNull();
  });

  /*
   * The bug this prevents: with a demotion flag set, choosing a mode would
   * re-read it and could instantly demote again, leaving the visitor unable to
   * get 3D back without clearing site data.
   *
   * In this environment there is no `window`, so the flag cannot actually be
   * persisted — what is asserted here is the observable half of the contract:
   * after an explicit choice, the choice is the reported mode and no fps
   * demotion is reported. The persistence itself is covered by the store's call
   * into `writeFpsDemoted(false)`, which `scene-mode` handles.
   */
  it("does not leave the demotion active after an explicit choice", () => {
    const store = newStore();
    store.detect();
    store.demoteForFrameRate();
    store.choose("3d");

    const chosen = store.getSnapshot();

    expect(chosen.mode).toBe("3d");
    expect(chosen.reason).toBeNull();
  });

  it("publishes a new snapshot identity when something changes", () => {
    const store = newStore();
    store.detect();
    const before = store.getSnapshot();

    store.choose("2d");

    expect(store.getSnapshot()).not.toBe(before);
  });
});

describe("demoteForFrameRate", () => {
  /*
   * The probe only runs on the automatic path — an explicit `3d` is not
   * second-guessed — so a late demotion must not overwrite a choice that landed
   * while the probe was still measuring.
   */
  it("does nothing once an explicit mode has been chosen", () => {
    const store = newStore();
    store.detect();
    store.choose("2d");
    const chosen = store.getSnapshot();

    store.demoteForFrameRate();

    expect(store.getSnapshot()).toEqual(chosen);
  });

  it("demotes to 2D with an fps reason on the automatic path", () => {
    const store = newStore();
    store.detect();
    store.demoteForFrameRate();

    const snapshot = store.getSnapshot();

    expect(snapshot.mode).toBe("auto");
    expect(snapshot.resolved).toBe("2d");
    expect(snapshot.reason).toBe("fps");
  });
});
