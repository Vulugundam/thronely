"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { formatUsd } from "@/lib/pricing";
import { SceneBillboard } from "./SceneBillboard";
import { SceneFrame } from "./SceneFrame";
import {
  Color,
  MeshPhysicalMaterial,
  type Group,
  Vector3,
  TorusGeometry,
  ConeGeometry,
  OctahedronGeometry,
  SphereGeometry,
  IcosahedronGeometry,
  RingGeometry,
  BoxGeometry,
  PlaneGeometry,
} from "three";
import { Bounds } from "@react-three/drei";

/**
 * The top three as 3D blocks, height proportional to money paid, crown on #1.
 *
 * Two deliberate choices:
 *
 * **Billboards are real DOM (`SceneBillboard`), not `<Text>`.** `<Text>` bakes
 * glyphs into the canvas texture, which makes rank, title and price invisible
 * to crawlers and screen readers. `SceneBillboard` mounts real DOM over the
 * block, so the text is selectable and readable by assistive tech. The
 * trade-off is that this DOM appears only after the client bundle runs, so it
 * is *not* in the server HTML — which is exactly why the 2D board is mandatory
 * rather than a fallback.
 *
 * **Block heights are square-rooted, not linear.** Money on this board spans two
 * orders of magnitude, so a linear scale makes the leader a wall and everyone
 * else a sliver. The square root keeps #2 and #3 visibly present while the
 * leader still clearly dominates; a floor keeps the shortest block readable as a
 * block rather than a plate.
 */

export type PodiumEntry = {
  id: string;
  slug: string;
  title: string;
  totalPaidCents: number;
};

/** Minimum and maximum block height, in world units. */
const MIN_HEIGHT = 0.85;
const MAX_HEIGHT = 3.6;

/** Horizontal spacing between block centres. */
const SPACING = 2.35;

/**
 * Where each rank stands, by rank rather than by slot.
 *
 * Keying off the rank — not the array position — is what keeps the layout right
 * on a short board. A board with only two paid listings still puts #1 in the
 * middle with #2 to its left, and a board with one puts the lone leader dead
 * centre, instead of silently drawing it wherever index 0 happens to fall.
 */
const SLOT_X: Record<number, number> = {
  1: 0,
  2: -SPACING,
  3: SPACING,
};

/** Extra z, towards the camera, for the winner. */
const WINNER_FORWARD = 0.55;

/**
 * Map money to block height.
 *
 * Falls back to a pleasant arrangement when every listing has paid the same
 * amount (or only one exists), because a range of zero would otherwise divide
 * by zero and collapse the podium.
 */
function heightFor(cents: number, min: number, max: number): number {
  if (max <= min) return (MIN_HEIGHT + MAX_HEIGHT) / 2;

  const normalised = (cents - min) / (max - min);
  const shaped = Math.sqrt(Math.max(0, normalised));

  return MIN_HEIGHT + shaped * (MAX_HEIGHT - MIN_HEIGHT);
}

/** Premium crown - multi-layered with animated particles and floating geometry. */
function Crown({ animated, y }: { animated: boolean; y: number }) {
  const groupRef = useRef<Group>(null);
  const [particles] = useState(() => {
    const arr = [];
    for (let i = 0; i < 18; i++) {
      arr.push({
        angle: (i / 18) * Math.PI * 2,
        radius: 0.42 + Math.random() * 0.18,
        height: 0.2 + Math.random() * 0.3,
        speed: 0.15 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        size: 0.02 + Math.random() * 0.04,
        color: Math.random() > 0.5 ? "#ffd700" : "#fff8e0",
      });
    }
    return arr;
  });

  const [sparkles] = useState(() => {
    const arr = [];
    for (let i = 0; i < 12; i++) {
      arr.push({
        angle: (i / 12) * Math.PI * 2 + Math.random() * 0.5,
        radius: 0.6 + Math.random() * 0.4,
        height: 0.1 + Math.random() * 0.5,
        speed: 0.3 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        size: 0.015 + Math.random() * 0.025,
        opacity: 0.4 + Math.random() * 0.4,
      });
    }
    return arr;
  });

  useFrame((_, delta) => {
    if (!animated || !groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.18;
  });

  return (
    <group ref={groupRef} position={[0, y, 0]}>
      {/* Outer glowing ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.52, 0.62, 32]} />
        <meshPhysicalMaterial
          color="#f5c852"
          metalness={0.9}
          roughness={0.15}
          clearcoat={1.0}
          clearcoatRoughness={0.05}
          emissive="#8b6914"
          emissiveIntensity={1.2}
          side={2}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Main crown band */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.48, 0.04, 16, 48]} />
        <meshPhysicalMaterial
          color="#f5c852"
          metalness={1.0}
          roughness={0.08}
          clearcoat={1.0}
          clearcoatRoughness={0.03}
          emissive="#8b6914"
          emissiveIntensity={0.9}
          reflectivity={1.0}
        />
      </mesh>

      {/* Inner band - darker gold */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <torusGeometry args={[0.35, 0.025, 12, 32]} />
        <meshPhysicalMaterial
          color="#c9a032"
          metalness={0.95}
          roughness={0.12}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          emissive="#6b4a10"
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* Crown points - 5 tall spires with gem tips */}
      {[0, 1, 2, 3, 4].map((index) => {
        const angle = (index / 5) * Math.PI * 2;
        const x = Math.cos(angle) * 0.48;
        const z = Math.sin(angle) * 0.48;
        return (
          <group key={index} position={[x, 0.35, z]} rotation={[0, -angle + Math.PI / 2, 0]}>
            <mesh position={[0, 0.22, 0]}>
              <coneGeometry args={[0.07, 0.6, 8]} />
              <meshPhysicalMaterial
                color="#ffdf6a"
                metalness={0.98}
                roughness={0.06}
                clearcoat={1.0}
                clearcoatRoughness={0.02}
                emissive="#9a7a14"
                emissiveIntensity={1.0}
              />
            </mesh>
            {/* Gem tip on each spire */}
            <mesh position={[0, 0.58, 0]} scale={0.7}>
              <octahedronGeometry args={[0.12, 0]} />
              <meshPhysicalMaterial
                color="#fff8e0"
                metalness={0.2}
                roughness={0.03}
                clearcoat={1.0}
                clearcoatRoughness={0.0}
                transmission={0.9}
                thickness={0.4}
                ior={2.4}
                emissive="#fff0c0"
                emissiveIntensity={0.5}
              />
            </mesh>
          </group>
        );
      })}

      {/* Central floating jewel */}
      <mesh position={[0, 0.8, 0]} scale={0.8}>
        <icosahedronGeometry args={[0.18, 1]} />
        <meshPhysicalMaterial
          color="#fff8e0"
          metalness={0.15}
          roughness={0.02}
          clearcoat={1.0}
          clearcoatRoughness={0.0}
          transmission={0.92}
          thickness={0.6}
          ior={2.4}
          emissive="#fff0c0"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Floating gold particles around crown */}
      {animated && particles.map((p, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(p.angle + p.phase) * p.radius,
            p.height + Math.sin(p.phase * 1.5) * 0.04,
            Math.sin(p.angle + p.phase) * p.radius
          ]}
          scale={p.size * (1 + Math.sin(p.phase * 2) * 0.3)}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            color={p.color}
            transparent
            opacity={0.85}
            blending={2}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Sparkle particles - larger orbit */}
      {animated && sparkles.map((p, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(p.angle + p.phase) * p.radius,
            p.height + Math.cos(p.phase * 1.2) * 0.06,
            Math.sin(p.angle + p.phase) * p.radius
          ]}
          scale={p.size}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ffd700"
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

/** Block with premium materials, beveled edges, subtle animations, and hover effects. */
function Block({
  entry,
  rank,
  min,
  max,
  animated,
  showCrown,
}: {
  entry: PodiumEntry;
  rank: 1 | 2 | 3;
  min: number;
  max: number;
  animated: boolean;
  showCrown: boolean;
}) {
  const height = heightFor(entry.totalPaidCents, min, max);
  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [entranceProgress, setEntranceProgress] = useState(0);

  // Rank-specific premium material configurations
  const materials = useMemo(() => {
    if (rank === 1) {
      // GOLD - #1: Warm gold with subsurface scattering feel
      return {
        body: {
          color: new Color("#7a5a0e"),
          metalness: 0.88,
          roughness: 0.22,
          clearcoat: 0.45,
          clearcoatRoughness: 0.12,
          emissive: new Color("#3d2f08"),
          emissiveIntensity: 0.45,
        },
        top: {
          color: new Color("#f5c852"),
          metalness: 1.0,
          roughness: 0.06,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          emissive: new Color("#8b6914"),
          emissiveIntensity: 1.3,
        },
        side: {
          color: new Color("#5a420a"),
          metalness: 0.75,
          roughness: 0.32,
          emissive: new Color("#2d2006"),
          emissiveIntensity: 0.35,
        },
        accentColor: "#f5c852",
        glowColor: "#ffd700",
        particleColor: "#ffd700",
      };
    } else if (rank === 2) {
      // SILVER - #2: Cool platinum with violet undertones
      return {
        body: {
          color: new Color("#3a4052"),
          metalness: 0.82,
          roughness: 0.26,
          clearcoat: 0.5,
          clearcoatRoughness: 0.1,
          emissive: new Color("#1a1d2a"),
          emissiveIntensity: 0.4,
        },
        top: {
          color: new Color("#d0d8e8"),
          metalness: 0.95,
          roughness: 0.1,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          emissive: new Color("#3a4052"),
          emissiveIntensity: 0.9,
        },
        side: {
          color: new Color("#2d3242"),
          metalness: 0.7,
          roughness: 0.38,
          emissive: new Color("#12141e"),
          emissiveIntensity: 0.3,
        },
        accentColor: "#c8d0e0",
        glowColor: "#a8b8e8",
        particleColor: "#a8b8e8",
      };
    } else {
      // VIOLET - #3: Deep amethyst with magical glow
      return {
        body: {
          color: new Color("#3d2a5a"),
          metalness: 0.65,
          roughness: 0.32,
          clearcoat: 0.4,
          clearcoatRoughness: 0.18,
          emissive: new Color("#1a0d26"),
          emissiveIntensity: 0.5,
        },
        top: {
          color: new Color("#b88cfa"),
          metalness: 0.88,
          roughness:0.12,
          clearcoat: 0.95,
          clearcoatRoughness: 0.06,
          emissive: new Color("#5a3a96"),
          emissiveIntensity: 1.1,
        },
        side: {
          color: new Color("#2d1a4a"),
          metalness: 0.58,
          roughness: 0.4,
          emissive: new Color("#150822"),
          emissiveIntensity: 0.35,
        },
        accentColor: "#b88cfa",
        glowColor: "#a077e8",
        particleColor: "#b88cfa",
      };
    }
  }, [rank]);

  // Entrance animation
  useFrame(() => {
    if (entranceProgress < 1) {
      setEntranceProgress(p => Math.min(1, p + 0.015));
    }
  });

  // Subtle hover/entrance animation
  useFrame((state, delta) => {
    if (!animated || !groupRef.current) return;

    // Gentle breathing for #1
    if (rank === 1) {
      const breathe = Math.sin(state.clock.elapsedTime * 0.7) * 0.01;
      groupRef.current.scale.y = 1 + breathe;
      groupRef.current.position.y = -breathe * height / 2;
    }

    // Slow rotation for crown blocks
    if (showCrown) {
      groupRef.current.rotation.y += delta * 0.015;
    }

    // Hover lift
    if (hovered) {
      groupRef.current.position.y += (0.08 - groupRef.current.position.y) * 0.1;
    } else {
      groupRef.current.position.y += (0 - groupRef.current.position.y) * 0.1;
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      scale={entranceProgress}
      position={[0, (1 - entranceProgress) * -2, 0]}
    >
      {/* Main block body */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.75, height, 1.75]} />
        <meshPhysicalMaterial
          {...materials.body}
          side={2}
        />
      </mesh>

      {/* Top face - distinct material for highlight */}
      <mesh position={[0, height + 0.012, 0]}>
        <boxGeometry args={[1.78, 0.025, 1.78]} />
        <meshPhysicalMaterial
          {...materials.top}
        />
      </mesh>

      {/* Side accent strips - subtle vertical highlights */}
      <mesh position={[0.89, height / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.02, height * 0.92, 1.65]} />
        <meshPhysicalMaterial
          {...materials.side}
          emissiveIntensity={materials.side.emissiveIntensity + (hovered ? 0.25 : 0)}
        />
      </mesh>
      <mesh position={[-0.89, height / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.02, height * 0.92, 1.65]} />
        <meshPhysicalMaterial
          {...materials.side}
          emissiveIntensity={materials.side.emissiveIntensity + (hovered ? 0.25 : 0)}
        />
      </mesh>
      <mesh position={[0, height / 2, 0.89]}>
        <boxGeometry args={[1.65, height * 0.92, 0.02]} />
        <meshPhysicalMaterial
          {...materials.side}
          emissiveIntensity={materials.side.emissiveIntensity + (hovered ? 0.25 : 0)}
        />
      </mesh>
      <mesh position={[0, height / 2, -0.89]}>
        <boxGeometry args={[1.65, height * 0.92, 0.02]} />
        <meshPhysicalMaterial
          {...materials.side}
          emissiveIntensity={materials.side.emissiveIntensity + (hovered ? 0.25 : 0)}
        />
      </mesh>

      {/* Bottom bevel ring */}
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.1, 0.05, 8, 32]} />
        <meshPhysicalMaterial
          color={materials.body.color}
          metalness={materials.body.metalness}
          roughness={materials.body.roughness + 0.1}
          emissive={materials.body.emissive}
          emissiveIntensity={materials.body.emissiveIntensity * 0.5}
        />
      </mesh>

      {/* Floating particles around block when hovered or for #1 */}
      {(animated && (hovered || rank === 1)) && (
        <BlockParticles
          height={height}
          color={materials.particleColor}
          rank={rank}
          hovered={hovered}
        />
      )}

      {showCrown && <Crown animated={animated} y={height + 0.5} />}

      {/* HTML labels above each block - rank number and price in dark pill */}
      <SceneBillboard
        position={[0, height + (showCrown ? 1.0 : 0.35), 0]}
        center
        distanceFactor={11}
        style={{ pointerEvents: "none" }}
        zIndexRange={[10, 0]}
      >
        <div className="w-48 select-none text-center">
          <div className="flex flex-col items-center gap-1">
            <span
              className="font-display text-[2.4rem] font-bold leading-none tabular-nums"
              style={{
                color: materials.accentColor,
                textShadow: `
                  0 0 10px ${materials.glowColor}90,
                  0 2px 14px rgba(0,0,0,0.95)
                `,
              }}
            >
              {rank}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[0.7rem] font-semibold tabular-nums text-ivory"
              style={{
                background: "rgba(11, 10, 20, 0.9)",
                backdropFilter: "blur(8px)",
                border: "1px solid " + materials.glowColor + "40",
                boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              }}
            >
              {formatUsd(entry.totalPaidCents)}
            </span>
          </div>
        </div>
      </SceneBillboard>
    </group>
  );
}

/** Ambient particles around blocks */
function BlockParticles({
  height,
  color,
  rank,
  hovered,
}: {
  height: number;
  color: string;
  rank: 1 | 2 | 3;
  hovered: boolean;
}) {
  const [particles] = useState(() => {
    const arr = [];
    const count = rank === 1 ? 12 : 8;
    for (let i = 0; i < count; i++) {
      arr.push({
        angle: (i / count) * Math.PI * 2,
        radius: 1.0 + Math.random() * 0.4,
        height: Math.random() * height * 0.9,
        speed: 0.1 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
        size: 0.015 + Math.random() * 0.025,
        opacity: 0.3 + Math.random() * 0.4,
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
            Math.cos(elapsed.current * p.speed + p.phase) * p.radius,
            p.height,
            Math.sin(elapsed.current * p.speed + p.phase) * p.radius,
          ]}
          scale={p.size * (hovered ? 1.5 : 1) * (1 + Math.sin(elapsed.current * 2 + p.phase) * 0.2)}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={p.opacity * (hovered ? 1.5 : 1)}
            blending={2}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Cinematic camera drift with mouse parallax and subtle depth breathing.
 */
function CameraDrift({ animated }: { animated: boolean }) {
  const elapsed = useRef(0);
  const { camera } = useThree();

  useFrame((state, delta) => {
    if (!animated) return;
    elapsed.current += delta;

    const t = elapsed.current * 0.12;

    // Idle drift: a gentle sweep so the scene is alive without being busy.
    const driftX = Math.sin(t) * 0.35;
    const driftY = Math.sin(t * 0.5) * 0.15;
    const driftZ = Math.cos(t * 0.3) * 0.25;

    // Parallax: pointer influence stays small so the horizon never tips.
    const parallaxX = state.pointer.x * 0.4;
    const parallaxY = state.pointer.y * 0.2;

    // Smooth camera interpolation
    camera.position.x += (driftX + parallaxX - camera.position.x) * 0.025;
    camera.position.y += (3.5 + driftY + parallaxY - camera.position.y) * 0.025;
    camera.position.z += (10.5 + driftZ - camera.position.z) * 0.02;
    camera.lookAt(0, 1.8, 0);
  });

  return null;
}

/** Subtle floating particles in the scene for atmosphere. */
function AtmosphereParticles({ animated }: { animated: boolean }) {
  const [particles] = useState(() => {
    const arr = [];
    for (let i = 0; i < 40; i++) {
      arr.push({
        x: (Math.random() - 0.5) * 20,
        y: Math.random() * 5 + 0.5,
        z: (Math.random() - 0.5) * 16 - 4,
        size: 0.01 + Math.random() * 0.03,
        speed: 0.015 + Math.random() * 0.035,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.65 ? "#ffd700" : (Math.random() > 0.5 ? "#a888ff" : "#ffffff"),
        opacity: 0.1 + Math.random() * 0.25,
      });
    }
    return arr;
  });

  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!animated) return;
    elapsed.current += delta;
  });

  if (!animated) return null;

  return (
    <group>
      {particles.map((p, i) => (
        <mesh
          key={i}
          position={[
            p.x + Math.sin(elapsed.current * p.speed + p.phase) * 0.4,
            p.y + Math.cos(elapsed.current * p.speed * 0.7 + p.phase) * 0.2,
            p.z + Math.cos(elapsed.current * p.speed * 0.5 + p.phase) * 0.3,
          ]}
          scale={p.size * (1 + Math.sin(elapsed.current + p.phase) * 0.3)}
          rotation={[elapsed.current * 0.08, elapsed.current * 0.12, 0]}
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

export function PodiumScene({
  rows,
  moneyRange,
  animate,
}: {
  rows: PodiumEntry[];
  moneyRange: { min: number; max: number };
  animate: boolean;
}) {
  return (
    <SceneFrame cameraPosition={[0, 3, 10]} enablePostProcessing={true}>
      <Bounds fit clip observe margin={1.4}>
        <PodiumContents rows={rows} moneyRange={moneyRange} animate={animate} />
      </Bounds>
    </SceneFrame>
  );
}

/** The scene's contents, kept apart so the canvas frame stays a plain wrapper. */
function PodiumContents({
  rows,
  moneyRange,
  animate,
}: {
  rows: PodiumEntry[];
  moneyRange: { min: number; max: number };
  animate: boolean;
}) {
  /**
   * Rank is the array index plus one, so position derives from rank rather than
   * from how many entries happen to be present.
   */
  const slots = useMemo(
    () =>
      rows.slice(0, 3).map((entry, index) => {
        const rank = (index + 1) as 1 | 2 | 3;
        return {
          entry,
          rank,
          x: SLOT_X[rank],
          z: rank === 1 ? WINNER_FORWARD : 0,
        };
      }),
    [rows],
  );

  return (
    <>
      <CameraDrift animated={animate} />
      <AtmosphereParticles animated={animate} />

      {slots.map(({ entry, rank, x, z }) => (
        <group key={entry.id} position={[x, 0, z]}>
          <Block
            entry={entry}
            rank={rank}
            min={moneyRange.min}
            max={moneyRange.max}
            animated={animate}
            showCrown={rank === 1}
          />
        </group>
      ))}

      {/* The plinth the blocks stand on - premium material with subtle reflection */}
      <mesh position={[0, -0.14, 0]} receiveShadow>
        <boxGeometry args={[SPACING * 3 + 1.6, 0.28, 3]} />
        <meshPhysicalMaterial
          color="#08070d"
          metalness={0.65}
          roughness={0.3}
          clearcoat={0.35}
          clearcoatRoughness={0.18}
          reflectivity={0.55}
        />
      </mesh>

      {/* Single clean base ring - well below the blocks */}
      <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.2, 4.5, 32]} />
        <meshBasicMaterial
          color="#3d2f08"
          transparent
          opacity={0.08}
          side={2}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}