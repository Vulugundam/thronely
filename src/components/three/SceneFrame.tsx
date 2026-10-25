"use client";

import { useEffect, useRef, useState, type ReactNode, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { Bloom, ChromaticAberration, Vignette, Noise, ToneMapping, DepthOfField, GodRays } from "@react-three/postprocessing";
import { Environment, ContactShadows } from "@react-three/drei";
import { ToneMappingMode, BlendFunction } from "postprocessing";

/**
 * The shared canvas for every 3D scene.
 *
 * Four concerns live here so no individual scene has to remember them:
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
 *
 * 4. **Post-processing pipeline.** Bloom for emissive highlights, tone mapping
 *    for cinematic color, subtle chromatic aberration and vignette for lens
 *    character, film grain for texture, depth of field for focus, god rays for atmosphere.
 *    All behind a Suspense boundary so the static shell can stream first.
 */
export function SceneFrame({
  children,
  className,
  cameraPosition = [0, 3.2, 10.5],
  enablePostProcessing = true,
}: {
  children: ReactNode;
  className?: string;
  cameraPosition?: [number, number, number];
  enablePostProcessing?: boolean;
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
        camera={{ position: cameraPosition, fov: 38 }}
        gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
        shadows={true}
      >
        {/* Depth cue: the room fades into the dark rather than ending abruptly. */}
        <fog attach="fog" args={["#06050a", 10, 40]} />

        {/* Environment map for realistic reflections - dark throne room */}
        <Environment
          background={false}
          files={[
            "px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"
          ]}
          path="/env/throne-room/"
          preset="warehouse"
        />

        {/* Cinematic lighting setup - throne room atmosphere */}
        {/* Ambient - deep violet-black base */}
        <ambientLight intensity={0.15} color="#0d0a14" />

        {/* Hemisphere light - sky/ground gradient */}
        <hemisphereLight
          color="#3d2f08"
          groundColor="#1a0d26"
          intensity={0.4}
        />

        {/* Main key light - warm golden shaft from above (hero light) */}
        <directionalLight
          position={[4, 12, 5]}
          intensity={3.5}
          color="#fff8e8"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={25}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={-0.0003}
          shadow-normalBias={0.015}
          shadow-radius={3}
        />

        {/* Secondary key - cooler, from side for modeling */}
        <directionalLight
          position={[-8, 6, -4]}
          intensity={1.8}
          color="#c8b8ff"
          castShadow={false}
        />

        {/* Rim/edge light - separates forms from background */}
        <directionalLight
          position={[0, 3, -10]}
          intensity={2.2}
          color="#8866ff"
          castShadow={false}
        />

        {/* Hero accent - gold point light near podium center */}
        <pointLight
          position={[0, 5, 1.5]}
          intensity={80}
          color="#ffd700"
          decay={1.5}
          distance={20}
          castShadow={false}
        />

        {/* Secondary gold accent - warmth on left side */}
        <pointLight
          position={[-5, 3, 2]}
          intensity={45}
          color="#ffcc33"
          decay={1.8}
          distance={15}
        />

        {/* Violet magical accent - right side */}
        <pointLight
          position={[5, 2.5, 1]}
          intensity={35}
          color="#b88cfa"
          decay={2}
          distance={12}
        />

        {/* Deep background accent - subtle violet glow */}
        <pointLight
          position={[0, 1, -8]}
          intensity={25}
          color="#4a2d7a"
          decay={2}
          distance={25}
        />

        {/* Ground contact shadows */}
        <ContactShadows
          position={[0, -0.08, 0]}
          opacity={0.5}
          scale={15}
          blur={3}
          far={10}
          color="#000000"
          resolution={256}
        />

        {children}

        {/* Post-processing pipeline */}
        {enablePostProcessing && (
          <Suspense fallback={null}>
            <EffectComposer>
              {/* Tone mapping for cinematic look - ACES filmic */}
              <ToneMapping
                mode={ToneMappingMode.ACES_FILMIC}
                whitePoint={1.2}
                middleGrey={0.55}
                minLuminance={0.01}
                adaptationRate={1.0}
              />
              {/* Bloom on emissive highlights - gold crowns, violet accents */}
              <Bloom
                intensity={0.45}
                mipmapBlur={true}
                luminanceThreshold={0.65}
                luminanceSmoothing={0.02}
                radius={0.7}
                blendFunction={BlendFunction.SCREEN}
              />
              {/* Subtle chromatic aberration for lens character */}
              <ChromaticAberration offset={[0.001, 0.0005]} />
              {/* Vignette to focus attention center */}
              <Vignette eskil={true} offset={0.18} darkness={1.4} />
              {/* Film grain for texture - very subtle */}
              <Noise
                opacity={0.02}
                premultiply={true}
              />
            </EffectComposer>
          </Suspense>
        )}
      </Canvas>
    </div>
  );
}

/** Loading shell that matches scene dimensions while post-processing shaders compile. */
function SceneFrameLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
    </div>
  );
}