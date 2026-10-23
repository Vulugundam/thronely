"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as ReactDOM from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import {
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  type Group,
} from "three";

/**
 * DOM text pinned to a point in a 3D scene — the replacement for drei's `<Html>`.
 *
 * **Why not `<Html>`:** it tears its second React root down with a synchronous
 * `root.unmount()` from a layout-effect cleanup. Cleanups run mid-commit, and
 * React 19 flags unmounting a root during a commit on every scene mount
 * ("Attempted to synchronously unmount a root…"). The pattern is still in the
 * latest drei, so there is no upgrade to wait for.
 *
 * **Why a second root at all:** R3F's reconciler hosts THREE objects, not DOM
 * nodes — a DOM element rendered inside the canvas tree (a `react-dom` portal
 * included) is looked up in the THREE namespace and throws
 * "Span is not part of the THREE namespace". A DOM element can only enter
 * through a real `ReactDOM.createRoot`, which is exactly what drei does and
 * what this component does too.
 *
 * **The fix for the warning is when unmount runs, not where.** The cleanup
 * removes the element from the DOM synchronously but hands `root.unmount()` to
 * a macrotask, so it executes after the commit has finished and React has
 * nothing to warn about.
 *
 * The projection maths (screen position, `distanceFactor` scaling, z-index from
 * camera range) mirrors drei's non-`transform` mode, which is the only mode the
 * scenes here use.
 */

/** Scratch vectors, hoisted so the frame loop allocates nothing. */
const _world = new Vector3();
const _cameraPos = new Vector3();
const _camDir = new Vector3();
const _projected = new Vector3();
const _delta = new Vector3();

export function SceneBillboard({
  position,
  center = false,
  distanceFactor,
  zIndexRange = [10, 0],
  style,
  children,
}: {
  /** World-space point the billboard is pinned to. */
  position: [number, number, number];
  /** Centre the element on its anchor point (drei's `center`). */
  center?: boolean;
  /** Same contract as drei: larger is bigger on screen. */
  distanceFactor?: number;
  /** The CSS z-index range mapped from camera far → near. */
  zIndexRange?: [number, number];
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { gl, camera, size } = useThree();
  const groupRef = useRef<Group>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ReactDOM.Root | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  /**
   * Create the element and its root once, appended next to the canvas — the
   * same mount point drei's `<Html>` uses. The root is stored in a ref so the
   * cleanup can find it even if this effect re-runs.
   */
  useLayoutEffect(() => {
    const target = (gl.domElement.parentNode as HTMLElement | null) ?? null;
    if (!target) return;
    targetRef.current = target;

    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;top:0;left:0;opacity:0;will-change:transform;";

    target.appendChild(el);
    containerRef.current = el;

    const root = ReactDOM.createRoot(el);
    rootRef.current = root;

    return () => {
      targetRef.current = null;
      containerRef.current = null;
      rootRef.current = null;
      el.remove();
      // Deferred out of the commit phase: unmounting synchronously here is
      // exactly what React 19 warns about.
      setTimeout(() => root.unmount(), 0);
    };
  }, [gl]);

  /**
   * Keep the root's content in step with the props. A separate effect because
   * the root must exist first; re-runs whenever the rendered children change.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.render(
      <div
        style={{
          transform: center ? "translate(-50%, -50%)" : "none",
          ...style,
        }}
      >
        {children}
      </div>,
    );
  });

  useFrame(() => {
    const group = groupRef.current;
    const el = containerRef.current;
    if (!group || !el) return;

    group.updateWorldMatrix(true, false);
    const world = _world.setFromMatrixPosition(group.matrixWorld);

    const cameraPos = _cameraPos.setFromMatrixPosition(camera.matrixWorld);
    const distance = world.distanceTo(cameraPos);

    // Hidden while behind the camera — projecting through it would wrap the
    // billboard to the far side of the screen.
    const behindCamera =
      _delta.copy(world).sub(cameraPos).angleTo(camera.getWorldDirection(_camDir)) >
      Math.PI / 2;

    const projected = _projected.copy(world).project(camera);
    const x = projected.x * (size.width / 2) + size.width / 2;
    const y = -projected.y * (size.height / 2) + size.height / 2;

    // Perspective: scale shrinks with distance from the camera. Orthographic:
    // the zoom is the scale.
    const scale =
      distanceFactor === undefined
        ? 1
        : camera instanceof PerspectiveCamera
          ? (1 / (2 * Math.tan((camera.fov * Math.PI) / 360) * distance)) *
            distanceFactor
          : camera instanceof OrthographicCamera
            ? camera.zoom * distanceFactor
            : distanceFactor;

    // Depth ordering within the z-index range: far maps to zIndexRange[0],
    // near to zIndexRange[1].
    const A = (zIndexRange[1] - zIndexRange[0]) / (camera.far - camera.near);
    const B = zIndexRange[1] - A * camera.far;
    const zIndex = Math.round(A * distance + B);

    // Transform order matters: the -50% centre offset must compose before the
    // scale so it scales with the element — the same composition drei gets
    // from nesting the centre translate inside the scaled outer element.
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    el.style.zIndex = String(zIndex);
    el.style.display = behindCamera ? "none" : "block";
    // Visible from the first positioned frame onwards.
    el.style.opacity = "1";
  });

  return (
    // The invisible anchor the projection reads from. Nothing else belongs in
    // the canvas tree — DOM must never render through R3F's reconciler.
    <group ref={groupRef} position={position} />
  );
}
