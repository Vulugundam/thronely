"use client";

import { useRenderMode } from "./RenderModeProvider";
import type { FallbackReason } from "@/lib/scene-mode";

/**
 * The 2D/3D switch.
 *
 * Rendered only after detection has run, so it never flashes a wrong label — and
 * when 3D is impossible (no WebGL at all) it renders nothing rather than
 * offering a switch that cannot work. Every other reason to be on 2D is a
 * *preference the visitor can override*, so the control stays visible and the
 * reason is shown next to it.
 */

const REASON_COPY: Record<FallbackReason, string> = {
  "no-webgl":
    "This browser cannot draw 3D scenes, so the board is shown in 2D.",
  "reduced-motion":
    "Your system asks for reduced motion, so the board is shown in 2D.",
  "low-power":
    "This device reports limited resources, so the board is shown in 2D.",
  fps: "The 3D view was not holding a smooth frame rate, so it stepped back to 2D.",
  chosen: "3D is switched off.",
};

export function RenderModeToggle({ className }: { className?: string }) {
  const { mode, resolved, reason, ready, choose } = useRenderMode();

  // Before detection the server-rendered 2D state is on screen and no claim
  // about capability can honestly be made yet.
  if (!ready) return null;

  // A browser without WebGL has no third option to offer.
  if (reason === "no-webgl" && mode !== "3d") return null;

  const is3d = resolved === "3d";

  const next = is3d ? "2d" : "3d";

  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => choose(next)}
        aria-pressed={is3d}
        className="btn-ghost inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {is3d ? "▦" : "◈"}
        </span>
        {is3d ? "Switch to 2D" : "Switch to 3D"}
      </button>

      {!is3d && reason && (
        <p className="text-xs text-slate-dim">
          {REASON_COPY[reason]}
          {mode === "auto" && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => choose("3d")}
                className="text-gold-400 underline decoration-gold-400/40 underline-offset-2 transition-colors hover:text-gold-300"
              >
                Try it anyway
              </button>
            </>
          )}
        </p>
      )}

      {is3d && mode === "3d" && (
        <p className="text-xs text-slate-dim">
          Pinned to 3D.{" "}
          <button
            type="button"
            onClick={() => choose("auto")}
            className="text-gold-400 underline decoration-gold-400/40 underline-offset-2 transition-colors hover:text-gold-300"
          >
            Back to automatic
          </button>
        </p>
      )}
    </div>
  );
}
