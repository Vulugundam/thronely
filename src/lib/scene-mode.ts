/**
 * Render-capability detection for the 3D layer.
 *
 * Everything that reads `window`, `navigator` or a WebGL context lives here and
 * is guarded, so a Server Component can import this module's types and pure
 * functions without touching a browser global during prerender.
 *
 * The policy is deliberately pessimistic: 3D is earned on evidence. A browser
 * that cannot create a WebGL context, a device that reports low power, a
 * visitor who asked for reduced motion, or a machine that fails the frame-rate
 * probe all get the 2D board. That is not a degraded experience — the 2D board
 * is the accessible, crawlable source of truth — so falling back costs a
 * decoration, never content.
 */

/** The visitor's stored preference. `auto` lets detection decide. */
export type RenderMode = "auto" | "2d" | "3d";

/** What actually gets rendered once policy has been applied. */
export type ResolvedMode = "2d" | "3d";

/** Why a visitor is looking at the 2D board. Drives the toggle's copy. */
export type FallbackReason =
  | "reduced-motion"
  | "no-webgl"
  | "low-power"
  | "fps"
  | "chosen";

/** The stored preference, in localStorage. */
export const RENDER_MODE_KEY = "thronely:render-mode";

/**
 * Whether the frame-rate probe has demoted this browser.
 *
 * Kept separate from `RENDER_MODE_KEY` on purpose. An automatic demotion must
 * not silently overwrite an explicit `3d` choice, or a visitor whose first
 * two seconds were slow — a background tab, a cold compile, another app hogging
 * the GPU — could never get 3D back without clearing site data. A manual choice
 * clears this flag instead.
 */
export const FPS_DEMOTED_KEY = "thronely:render-demoted";

/** Median frames per second below which 3D is judged not to be holding up. */
export const MIN_SMOOTH_FPS = 40;

/** Logical cores at or below which a device is treated as low-power. */
const LOW_POWER_CORES = 4;

/** Device memory, in GiB, at or below which a device is treated as low-power. */
const LOW_POWER_MEMORY = 4;

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * The signals the decision is made from, gathered into one plain value.
 *
 * Kept separate from `decideRenderMode` so the policy itself is a pure function
 * with no globals: that is the part worth testing, and stubbing four booleans is
 * a real test where stubbing a WebGL context would only be a mock of a mock.
 */
export type RenderSignals = {
  prefersReducedMotion: boolean;
  supportsWebGL: boolean;
  lowPower: boolean;
  fpsDemoted: boolean;
};

/**
 * Apply the policy: explicit choice first, then every environmental reason to
 * stay 2D.
 *
 * WebGL support is a **hard requirement**, checked before the explicit choice is
 * honoured. "Overriding" it is not a thing that can succeed — a browser without
 * WebGL cannot create the context the scene draws into, so an explicit `3d`
 * there would mount a canvas that renders nothing. Reduced motion, low power and
 * a poor probe are all *preferences about quality*, and those an explicit `3d`
 * does override.
 *
 * Reduced motion in particular is honoured inside the scenes — no drift, no
 * crown spin, no entrance animation — rather than by refusing the layer, because
 * it is a preference about movement, not about which renderer to use.
 */
export function decideRenderMode(
  mode: RenderMode,
  signals: RenderSignals,
): ResolvedMode {
  // Nothing can draw without a context, whatever was asked for.
  if (!signals.supportsWebGL) return "2d";

  if (mode === "2d") return "2d";
  if (mode === "3d") return "3d";

  return fallbackReasonFor(signals) === null ? "3d" : "2d";
}

/**
 * The first environmental reason to stay 2D, or null when 3D is clear to run.
 *
 * Ordered most-fundamental first: a browser that cannot do WebGL at all is a
 * more useful thing to tell someone than that their core count is low.
 */
export function fallbackReasonFor(signals: RenderSignals): FallbackReason | null {
  if (!signals.supportsWebGL) return "no-webgl";
  if (signals.prefersReducedMotion) return "reduced-motion";
  if (signals.lowPower) return "low-power";
  if (signals.fpsDemoted) return "fps";
  return null;
}

export function readRenderMode(): RenderMode {
  if (!isBrowser()) return "auto";
  try {
    const raw = window.localStorage.getItem(RENDER_MODE_KEY);
    return raw === "2d" || raw === "3d" ? raw : "auto";
  } catch {
    // Private browsing and hardened privacy settings throw on storage access.
    // Treat that as "no stated preference" rather than failing the page.
    return "auto";
  }
}

export function writeRenderMode(mode: RenderMode): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(RENDER_MODE_KEY, mode);
  } catch {
    // Storage unavailable: the choice simply does not survive a reload.
  }
}

export function readFpsDemoted(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(FPS_DEMOTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFpsDemoted(value: boolean): void {
  if (!isBrowser()) return;
  try {
    if (value) window.localStorage.setItem(FPS_DEMOTED_KEY, "1");
    else window.localStorage.removeItem(FPS_DEMOTED_KEY);
  } catch {
    // As above: a lost demotion flag only costs the probe running again.
  }
}

export function prefersReducedMotion(): boolean {
  if (!isBrowser() || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Low-power heuristics.
 *
 * All three are advisory and none is universally supported — `deviceMemory` is
 * Chromium-only and `saveData` needs the Network Information API — so each is
 * checked independently and an absent value is treated as "not a signal",
 * never as "low power". Guessing pessimistically here would strand capable
 * browsers on the 2D board for no reason.
 */
export function isLowPowerDevice(): boolean {
  if (!isBrowser()) return false;

  const nav = window.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  if (
    typeof nav.hardwareConcurrency === "number" &&
    nav.hardwareConcurrency > 0 &&
    nav.hardwareConcurrency <= LOW_POWER_CORES
  ) {
    return true;
  }

  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= LOW_POWER_MEMORY) {
    return true;
  }

  // An explicit request to conserve data almost always means metered or poor
  // connectivity; a WebGL scene is not worth a visitor's data allowance.
  if (nav.connection?.saveData === true) return true;

  return false;
}

/**
 * Cached WebGL probe.
 *
 * Creating a context is not free and the answer cannot change within a page
 * load, so it is measured once. The probe context is released immediately: a
 * browser allows only a handful of live contexts, and leaking one here would
 * count against the canvas the scene actually wants.
 */
let webglSupport: boolean | null = null;

export function supportsWebGL(): boolean {
  if (!isBrowser()) return false;
  if (webglSupport !== null) return webglSupport;

  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");

    webglSupport = context !== null;

    // Release the probe context immediately. A browser allows only a handful of
    // live WebGL contexts, and a leaked one here would count against the canvas
    // the scene actually wants. Guarded by `typeof` rather than `instanceof`
    // because the constructors are absent in non-browser contexts, where the
    // resulting ReferenceError would be caught below and misread as "no WebGL".
    if (context !== null && typeof context.getExtension === "function") {
      context.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    webglSupport = false;
  }

  return webglSupport;
}

/** Gather the live signals and run the policy. */
export function resolveRenderMode(): ResolvedMode {
  return decideRenderMode(readRenderMode(), currentSignals());
}

export function currentSignals(): RenderSignals {
  return {
    prefersReducedMotion: prefersReducedMotion(),
    supportsWebGL: supportsWebGL(),
    lowPower: isLowPowerDevice(),
    fpsDemoted: readFpsDemoted(),
  };
}

/**
 * Forget the cached WebGL probe.
 *
 * Exists for tests, which need one clean measurement per case; the cache would
 * otherwise leak the first stubbed result into every later assertion.
 */
export function resetDetectionCache(): void {
  webglSupport = null;
}
