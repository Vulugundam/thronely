"use client";

import { useCallback, useRef, type ReactNode } from "react";

/** Maximum rotation, in degrees, at the very edge of the card. */
const MAX_TILT_DEG = 8;

/**
 * 2.5D tilt-on-hover wrapper.
 *
 * Writes the rotation into CSS custom properties rather than React state, so
 * pointer movement never triggers a re-render — the transform stays on the
 * compositor. The `.tilt` class in globals.css does the actual transform, and
 * already collapses to `none` under prefers-reduced-motion, so this component
 * needs no motion check of its own.
 */
export function TiltCard({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const node = ref.current;
    // Pointer-only: on touch, a tilt mid-scroll is noise, and it fights the scroll.
    if (!node || event.pointerType !== "mouse") return;

    const rect = node.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width; // 0..1
    const py = (event.clientY - rect.top) / rect.height; // 0..1

    // Invert the pointer so the card leans towards the cursor.
    node.style.setProperty("--tilt-y", `${(px - 0.5) * 2 * MAX_TILT_DEG}deg`);
    node.style.setProperty("--tilt-x", `${(0.5 - py) * 2 * MAX_TILT_DEG}deg`);
  }, []);

  const handlePointerLeave = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--tilt-x", "0deg");
    node.style.setProperty("--tilt-y", "0deg");
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`tilt ${className ?? ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </Tag>
  );
}
