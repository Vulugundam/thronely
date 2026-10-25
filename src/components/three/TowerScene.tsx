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
  CylinderGeometry,
  PlaneGeometry,
} from "three";
import { formatUsd } from "@/lib/pricing";
import { SceneFrame } from "./SceneFrame";

/**
 * The top twenty as towers, drawn in a single instanced mesh.
 *
 * Layout: 20 bars evenly spaced along X axis, camera front-on.
 * Height = square-root normalized price with floor.
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

const MIN_HEIGHT = 0.4;
const MAX_HEIGHT = 5.0;

/** X-axis layout: 20 bars evenly spaced along X */
const BAR_WIDTH = 0.5;
const BAR_SPACING = 0.72;
const TOTAL_WIDTH = BAR_SPACING * TOWER_SIZE;

/** Premium color palette for tower ranks */
const RANK_COLORS = [
  // #1 - Gold
  {
    body: new Color("#6a4e08"),
    top: new Color("#f5c852"),
    side: new Color("#4a3606"),
    emissive: new Color("#2d1f04"),
    accent: "#f5c852",
    glow: "#ffd700",
    particleColor: "#ffd700",
    metalness: 0.92,
    roughness: 0.18,
  },
  // #2 - Silver/Platinum
  {
    body: new Color("#323848"),
    top: new Color("#d8e0f0"),
    side: new Color("#242838"),
    emissive: new Color("#141620"),
    accent: "#c8d0e0",
    glow: "#a8b8e8",
    particleColor: "#a8b8e8",
    metalness: 0.88,
    roughness: 0.22,
  },
  // #3 - Violet/Amethyst
  {
    body: new Color("#34204c"),
    top: new Color("#c094fc"),
    side: new Color("#241438"),
    emissive: new Color("#140820"),
    accent: "#c094fc",
    glow: "#a077e8",
    particleColor: "#b88cfa",
    metalness: 0.82,
    roughness: 0.26,
  },
  // #4+ - Steel/Iron
  {
    body: new Color("#343844"),
    top: new Color("#7a8498"),
    side: new Color("#242830"),
    emissive: new Color("#121418"),
    accent: "#6a7488",
    glow: "#5a6478",
    particleColor: "#6a7488",
    metalness: 0.68,
    roughness: 0.38,
  },
];

const HIGHLIGHT = new Color("#ffe08a");

function heightFor(cents: number, min: number, max: number): number {
  if (max <= min) return (MIN_HEIGHT + MAX_HEIGHT) / 2;
  const normalised = (cents - min) / (max - min);
  const shaped = Math.sqrt(Math.max(0, normalised));
  return MIN_HEIGHT + shaped * (MAX_HEIGHT - MIN_HEIGHT);
}

/** X position for bar at index (centered at 0) */
function xAt(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * BAR_SPACING;
}

export function TowerScene({
  entries,
  animate,
}: {
  entries: TowerEntry[];
  animate: boolean;
}) {
  return (
    <SceneFrame cameraPosition={[0, 3.5, 9]}>
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
  const capsRef = useRef<InstancedMesh>(null);
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
   */
  useFrame(() => {
    const mesh = meshRef.current;
    const caps = capsRef.current;
    if (!mesh || !caps) return;

    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Quaternion();
    const colour = new Color();

    towers.forEach((tower, index) => {
      const height = heightFor(tower.totalPaidCents, moneyRange.min, moneyRange.max);
      const x = xAt(index, towers.length);

      position.set(x, height / 2, 0);
      scale.set(1, height, 1);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);

      // Cap position
      position.y = height + 0.025;
      scale.set(1.08, 0.05, 1.08);
      matrix.compose(position, rotation, scale);
      caps.setMatrixAt(index, matrix);

      // Color based on rank
      const rankColors = index < 3 ? RANK_COLORS[index] : RANK_COLORS[3];
      colour.copy(rankColors.top);
      if (hovered === index) colour.lerp(HIGHLIGHT, 0.5);
      mesh.setColorAt(index, colour);
      caps.setColorAt(index, colour);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    caps.instanceColor!.needsUpdate = true;
  });

  // No idle rotation - bars stay upright and readable

  if (towers.length === 0) return null;

  return (
    <group ref={groupRef}>
      {/* Main tower bodies - instanced for performance */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, towers.length]}
        onPointerMove={(event) => {
          event.stopPropagation();
          setHovered(typeof event.instanceId === "number" ? event.instanceId : null);
        }}
        onPointerOut={() => setHovered(null)}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[BAR_WIDTH * 0.5, BAR_WIDTH * 0.5, 1, 10, 1, false, 0, Math.PI * 2]} />
        <meshPhysicalMaterial
          metalness={0.8}
          roughness={0.24}
          clearcoat={0.5}
          clearcoatRoughness={0.12}
          emissive="#120e1e"
          emissiveIntensity={0.6}
          vertexColors
          reflectivity={0.85}
        />
      </instancedMesh>

      {/* Tower caps - separate instanced mesh for distinct material */}
      <instancedMesh
        ref={capsRef}
        args={[undefined, undefined, towers.length]}
      >
        <cylinderGeometry args={[BAR_WIDTH * 0.53, BAR_WIDTH * 0.53, 0.05, 10, 1, true, 0, Math.PI * 2]} />
        <meshPhysicalMaterial
          metalness={0.98}
          roughness={0.06}
          clearcoat={1.0}
          clearcoatRoughness={0.02}
          emissiveIntensity={1.2}
          vertexColors
        />
      </instancedMesh>

      {/* Rank labels on ALL towers - visible billboards */}
      {towers.map((tower, index) => (
        <SceneBillboard
          key={tower.id}
          position={[
            xAt(index, towers.length),
            heightFor(tower.totalPaidCents, moneyRange.min, moneyRange.max) + 0.5,
            0,
          ]}
          center
          distanceFactor={14}
          style={{ pointerEvents: "none" }}
          zIndexRange={[10, 0]}
        >
          <div className={`w-36 text-center select-none ${index === hovered ? 'scale-110' : ''}`}>
            <span
              className={`font-display text-base font-bold leading-none tabular-nums ${
                index === 0 ? 'text-gold-400' : index === 1 ? 'text-white' : index === 2 ? 'text-violet-400' : 'text-slate-400'
              }`}
              style={{
                textShadow: `
                  0 0 8px rgba(0,0,0,0.9),
                  0 2px 8px rgba(0,0,0,0.8)
                `,
              }}
            >
              #{index + 1}
            </span>
            {index === hovered && (
              <>
                <p className="mt-0.5 truncate text-[0.7rem] font-semibold text-ivory">
                  {tower.title}
                </p>
                <p className="text-[0.65rem] font-semibold text-gold-400 tabular-nums">
                  {formatUsd(tower.totalPaidCents)}
                </p>
              </>
            )}
          </div>
        </SceneBillboard>
      ))}

      {/* The floor the towers rise from - premium dark surface with reflection */}
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[TOTAL_WIDTH + 2, 6]} />
        <meshPhysicalMaterial
          color="#06050a"
          metalness={0.55}
          roughness={0.4}
          clearcoat={0.3}
          clearcoatRoughness={0.25}
          reflectivity={0.45}
        />
      </mesh>

      {/* Subtle base line under bars */}
      <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TOTAL_WIDTH * 0.9, 0.4]} />
        <meshBasicMaterial
          color="#3d2f08"
          transparent
          opacity={0.06}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Ambient particles - reduced count, X-axis layout */
function TowerParticles({
  towers,
  moneyRange,
}: {
  towers: TowerEntry[];
  moneyRange: { min: number; max: number };
}) {
  const [particles] = useState(() => {
    const arr = [];
    for (let i = 0; i < 15; i++) {
      const towerIndex = Math.floor(Math.random() * towers.length);
      const height = heightFor(towers[towerIndex].totalPaidCents, moneyRange.min, moneyRange.max);
      const rankColors = towerIndex < 3 ? RANK_COLORS[towerIndex] : RANK_COLORS[3];
      const x = xAt(towerIndex, towers.length);

      arr.push({
        x: x + (Math.random() - 0.5) * BAR_SPACING * 0.5,
        y: Math.random() * height * 0.85,
        z: (Math.random() - 0.5) * 1.5,
        speed: 0.08 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        size: 0.008 + Math.random() * 0.025,
        color: rankColors.particleColor,
        opacity: 0.08 + Math.random() * 0.12,
      });
    }
    return arr;
  });

  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
  });

  return (
    <group>
      {particles.map((p, i) => (
        <mesh
          key={i}
          position={[
            p.x + Math.sin(elapsed.current * p.speed + p.phase) * 0.2,
            p.y + Math.cos(elapsed.current * p.speed * 0.6 + p.phase) * 0.1,
            p.z + Math.sin(elapsed.current * p.speed + p.phase) * 0.15,
          ]}
          scale={p.size * (1 + Math.sin(elapsed.current * 1.5 + p.phase) * 0.4)}
          rotation={[elapsed.current * 0.1, elapsed.current * 0.15, 0]}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            color={p.color}
            transparent
            opacity={p.opacity}
            blending={2}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}