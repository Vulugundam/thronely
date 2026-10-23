"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { SceneBillboard } from "./SceneBillboard";
import {
  Color,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Group,
} from "three";
import { formatUsd } from "@/lib/pricing";
import { SceneFrame } from "./SceneFrame";

/**
 * The top twenty as towers, drawn in a single instanced mesh.
 *
 * The reason for instancing is concrete: twenty separate meshes would be twenty
 * draw calls and twenty material uploads per frame. One `InstancedMesh` is a
 * single draw call for all twenty, and the per-bar colour rides in an instance
 * attribute that costs nothing extra to update.
 *
 * Because the instanced bars are not individual scene objects, hit-testing is
 * done arithmetically against the fan layout rather than by raycasting each bar.
 * That is both cheaper and simpler than the alternative — and it is why the bars
 * are laid out on a known arc instead of an arbitrary arrangement.
 */

export type TowerEntry = {
  id: string;
  slug: string;
  title: string;
  totalPaidCents: number;
  categoryName: string;
};

/** How many listings the tower view shows. */
export const TOWER_SIZE = 20;

const MIN_HEIGHT = 0.5;
const MAX_HEIGHT = 5.2;

/** Radius of the arc the towers stand on, and the span of that arc. */
const ARC_RADIUS = 6.6;
const ARC_SPAN = Math.PI * 1.12;

const BAR_WIDTH = 0.72;
const BAR_DEPTH = 0.72;

/** Colours: gold for #1, silver, violet for third, steel for the rest. */
const GOLD = new Color("#e8b84b");
const SILVER = new Color("#b9c3d4");
const VIOLET = new Color("#a077e8");
const STEEL = new Color("#4d5670");
const HIGHLIGHT = new Color("#ffe08a");

function heightFor(cents: number, min: number, max: number): number {
  if (max <= min) return (MIN_HEIGHT + MAX_HEIGHT) / 2;
  const normalised = (cents - min) / (max - min);
  return MIN_HEIGHT + Math.sqrt(Math.max(0, normalised)) * (MAX_HEIGHT - MIN_HEIGHT);
}

/** Angle of the tower at `index`, measured around the Y axis. */
function angleAt(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index / (count - 1) - 0.5) * ARC_SPAN;
}

export function TowerScene({
  entries,
  animate,
}: {
  entries: TowerEntry[];
  animate: boolean;
}) {
  return (
    <SceneFrame cameraPosition={[0, 3.2, 8.2]}>
      <TowerContents entries={entries} animate={animate} />
    </SceneFrame>
  );
}

/** The scene's contents, kept apart so the canvas frame stays a plain wrapper. */
function TowerContents({
  entries,
  animate,
}: {
  entries: TowerEntry[];
  animate: boolean;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const groupRef = useRef<Group>(null);

  const [hovered, setHovered] = useState<number | null>(null);

  const towers = useMemo(() => entries.slice(0, TOWER_SIZE), [entries]);

  const moneyRange = useMemo(() => {
    const values = towers.map((tower) => tower.totalPaidCents);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [towers]);

  /**
   * Geometry is built once, then written into instance matrices on every change.
   *
   * Matrices are composed rather than set as Euler angles so a tower can be
   * scaled independently of its position — the height *is* the data here, so it
   * has to be reproducible exactly, not eyeballed.
   */
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Scratch objects hoisted out of the loop: allocating a Matrix4 per tower
    // per frame would hand the garbage collector 1,200 objects a second.
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Quaternion();
    const colour = new Color();

    towers.forEach((tower, index) => {
      const angle = angleAt(index, towers.length);
      const height = heightFor(tower.totalPaidCents, moneyRange.min, moneyRange.max);

      position.set(
        Math.sin(angle) * ARC_RADIUS,
        height / 2,
        Math.cos(angle) * ARC_RADIUS - ARC_RADIUS,
      );
      // The base geometry is one unit tall, so scaling Y *is* the height.
      scale.set(1, height, 1);

      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);

      colour.copy(
        index === 0
          ? GOLD
          : index === 1
            ? SILVER
            : index === 2
              ? VIOLET
              : STEEL,
      );
      if (hovered === index) colour.lerp(HIGHLIGHT, 0.55);
      mesh.setColorAt(index, colour);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  /**
   * Idle rotation, applied to the whole group.
   *
   * Rotating the parent is what makes this cheap: the instance matrices never
   * change, so the loop only touches one transform instead of twenty.
   */
  useFrame((state, delta) => {
    if (!animate || !groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.075;

    // A slow breath in elevation so the arc is legible as 3D from the front.
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.06;
  });

  if (towers.length === 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, towers.length]}
        onPointerMove={(event) => {
          // `instanceId` is provided by the instanced raycast; anything else
          // means the pointer is over empty space.
          event.stopPropagation();
          setHovered(typeof event.instanceId === "number" ? event.instanceId : null);
        }}
        onPointerOut={() => setHovered(null)}
      >
        <boxGeometry args={[BAR_WIDTH, 1, BAR_DEPTH]} />
        <meshStandardMaterial
          metalness={0.62}
          roughness={0.34}
          emissive="#221a33"
          emissiveIntensity={0.4}
        />
      </instancedMesh>

      {/* One billboard for the hovered tower only — twenty at once would be noise. */}
      {hovered !== null && towers[hovered] && (
        <SceneBillboard
          position={[
            Math.sin(angleAt(hovered, towers.length)) * ARC_RADIUS,
            heightFor(
              towers[hovered].totalPaidCents,
              moneyRange.min,
              moneyRange.max,
            ) + 0.55,
            Math.cos(angleAt(hovered, towers.length)) * ARC_RADIUS - ARC_RADIUS,
          ]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none" }}
          zIndexRange={[10, 0]}
        >
          <div className="w-52 rounded-lg border border-gold-400/30 bg-abyss-950/92 px-3 py-2 text-center shadow-lg backdrop-blur">
            <p className="font-display text-sm font-bold text-ivory">
              #{hovered + 1} · {towers[hovered].title}
            </p>
            <p className="mt-0.5 text-xs text-mist">
              {towers[hovered].categoryName}
            </p>
            <p className="mt-1 font-display text-base font-bold text-gold-400 tabular-nums">
              {formatUsd(towers[hovered].totalPaidCents)}
            </p>
          </div>
        </SceneBillboard>
      )}

      {/* The floor the towers rise from. */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ARC_RADIUS + 2.4, 48]} />
        <meshStandardMaterial color="#12101c" metalness={0.4} roughness={0.75} />
      </mesh>
    </group>
  );
}
