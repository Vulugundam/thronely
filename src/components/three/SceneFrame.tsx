"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";

/**
 * The shared canvas for every 3D scene.
 *
 * Three concerns live here so no individual scene has to remember them:
 *
 * 1. **Rendering stops when nobody is looking.** A WebGL scene that keeps
 *    animating off-screen burns battery and GPU for pixels no one sees. The
 *    canvas drops to `frameloop="never"` when it scrolls out of view or the tab
 *    is hidden, and resumes when it comes back. `frameloop` is a prop rather
 *    than a mount flag deliberately: unmounting would throw away the compiled
 *    shaders and geometry, so the scene would stutter on every scroll-past.
 *
 * 2. **The device pixel ratio is capped at 2.** On a 3x phone the extra pixels
 *    are invisible at this scale and cost roughly double the fill rate, which is
 *    the single most common reason a scene like this drops frames on mobile.
 *
 * 3. **The canvas is hidden from assistive tech.** The DOM `canvas` element is
 *    an opaque rectangle to a screen reader; the board below every scene is the
 *    accessible version of the same information, so this is marked `aria-hidden`
 *    rather than given a label that would only duplicate it.
 */
export function SceneFrame({
  children,
  className,
  cameraPosition = [0, 2.4, 8.5],
}: {
  children: ReactNode;
  className?: string;
  cameraPosition?: [number, number, number];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);

  /**
   * Pause when off-screen or when the tab is hidden.
   *
   * Both signals matter and neither implies the other: a scene can be scrolled
   * out of view in a visible tab, and a visible scene can sit in a background
   * tab. Pausing on `visibilitychange` also stops the browser from throttling
   * rAF for us, which produces uneven frames as the throttling kicks in.
   */
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    let onScreen = true;

    const update = () => {
      setActive(onScreen && document.visibilityState === "visible");
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        update();
      },
      // A small margin so the scene is already warm by the time it is seen,
      // rather than starting to animate as it crosses the viewport edge.
      { rootMargin: "120px" },
    );

    observer.observe(node);
    document.addEventListener("visibilitychange", update);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`relative h-full w-full ${className ?? ""}`}
    >
      <Canvas
        frameloop={active ? "always" : "never"}
        dpr={[1, 2]}
        camera={{ position: cameraPosition, fov: 42 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        {/* Depth cue: the room fades into the dark rather than ending abruptly. */}
        <fog attach="fog" args={["#0b0a12", 12, 30]} />
        <ambientLight intensity={0.55} />
        {/* The shaft from above that the page background implies. */}
        <directionalLight position={[4, 9, 5]} intensity={1.5} color="#ffe6b0" />
        {/* Violet rim light to separate silhouettes from the background. */}
        <pointLight position={[-6, 2, -4]} intensity={22} color="#8b5cf6" />
        {children}
      </Canvas>
    </div>
  );
}
