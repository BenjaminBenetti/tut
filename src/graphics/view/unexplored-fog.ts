import {
  Color,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  Vector2,
} from "three";

import type { TileGridSource } from "../../mapgen/model/tactical-map";
import type { SideVision } from "../../tactical/model/tactical-state";
import { gridKey } from "../../core/service/grid-math";
import { LEVEL_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import type { Disposable } from "../model/disposable";

// ===========================================
// Appearance
// ===========================================

/** Thin mist in world space; three offset sheets avoid a painted surface. */
const FOG_LAYERS = [0.18, 0.52, 0.9] as const;
const FOG_OPACITY = 0.075;
const FOG_COLOUR = 0xb6c1c4;

/** One level's sparse coverage; missing tiles must never grow fog. */
interface FogLevel {
  readonly root: Group;
  readonly mask: DataTexture;
  readonly data: Uint8Array;
  readonly tiles: TileGridSource["tiles"];
}

// ===========================================
// UnexploredFog
// ===========================================

/**
 * Low, depth-tested mist over never-explored tiles only (#770).
 * Each storey has its own mask, so knowing the street does not clear a
 * roof. The map view attaches the sheets to its level groups for peeling.
 * Nothing writes depth, casts shadows, intercepts picking, or uses DOM.
 */
export class UnexploredFog implements Disposable {
  // ===========================================
  // Fields and construction
  // ===========================================

  private readonly levels = new Map<number, FogLevel>();
  private readonly geometry: PlaneGeometry;
  private readonly materials: ShaderMaterial[] = [];

  /** Builds three shared-geometry sheets per populated level, hidden until vision arrives. */
  constructor(private readonly map: TileGridSource) {
    this.geometry = new PlaneGeometry(map.width, map.depth);
    this.geometry.rotateX(-Math.PI / 2);
    for (const tile of map.tiles) {
      if (!this.levels.has(tile.y)) this.buildLevel(tile.y);
    }
  }

  // ===========================================
  // Public methods
  // ===========================================

  /** Attaches the fog to the same level visibility controls as the terrain. */
  attachTo(groupFor: (level: number) => Group): void {
    for (const [level, fog] of this.levels) groupFor(level).add(fog.root);
  }

  /** Clears mist permanently on explored tiles, including after they leave sight. */
  setVision(vision: SideVision | undefined): void {
    const known = new Set(vision?.explored);
    for (const key of vision?.visible ?? []) known.add(key);
    for (const fog of this.levels.values()) {
      fog.data.fill(0);
      let count = 0;
      if (vision !== undefined) {
        for (const tile of fog.tiles) {
          if (!known.has(gridKey(tile, this.map.width, this.map.depth))) {
            fog.data[tile.z * this.map.width + tile.x] = 255;
            count++;
          }
        }
      }
      fog.mask.needsUpdate = true;
      fog.root.visible = count > 0;
    }
  }

  /** Releases masks, materials, geometry, and scene attachments on mission teardown. */
  dispose(): void {
    for (const fog of this.levels.values()) {
      fog.mask.dispose();
      fog.root.removeFromParent();
    }
    for (const material of this.materials) material.dispose();
    this.geometry.dispose();
  }

  // ===========================================
  // Level construction
  // ===========================================

  /** Creates a level's coverage texture and softly offset mist sheets. */
  private buildLevel(level: number): void {
    const { width, depth } = this.map;
    const data = new Uint8Array(width * depth);
    const mask = new DataTexture(data, width, depth, RedFormat);
    mask.minFilter = LinearFilter;
    mask.magFilter = LinearFilter;
    mask.needsUpdate = true;
    const root = new Group();
    root.name = `unexplored-fog-${String(level)}`;
    root.visible = false;
    for (const lift of FOG_LAYERS) {
      const material = new ShaderMaterial({
        uniforms: {
          uMask: { value: mask },
          uSize: { value: new Vector2(width, depth) },
          uColour: { value: new Color(FOG_COLOUR) },
          uOpacity: { value: FOG_OPACITY },
          uOffset: { value: lift * 3.7 },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: DoubleSide,
      });
      this.materials.push(material);
      const mesh = new Mesh(this.geometry, material);
      mesh.position.set(
        width / 2,
        level * LEVEL_HEIGHT + SLAB_HEIGHT + lift,
        depth / 2,
      );
      // Fog is atmosphere, never a target, even while a level is peeled.
      mesh.raycast = (): void => {
        // Atmosphere has no pickable surface.
      };
      root.add(mesh);
    }
    this.levels.set(level, {
      root,
      mask,
      data,
      tiles: this.map.tiles.filter((tile) => tile.y === level),
    });
  }
}

// ===========================================
// Shaders
// ===========================================

const VERTEX_SHADER = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D uMask;
  uniform vec2 uSize;
  uniform vec3 uColour;
  uniform float uOpacity;
  uniform float uOffset;
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
               mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
  }
  void main() {
    vec2 uv = vWorld.xz / uSize;
    // Gate on the actual cell first: linear filtering must not fog known
    // ground or fill the gaps in a sparse upper storey.
    vec2 cellUv = (floor(vWorld.xz) + 0.5) / uSize;
    if (texture2D(uMask, cellUv).r < 0.5) discard;
    float edge = smoothstep(0.5, 1.0, texture2D(uMask, uv).r);
    // Fade at the real map border as well; clamped texture sampling alone
    // would end the atmosphere in a straight opaque edge above the void.
    vec2 border = min(vWorld.xz, uSize - vWorld.xz);
    edge *= smoothstep(0.0, 0.7, min(border.x, border.y));
    vec2 p = vec2(vWorld.x * 0.36 + vWorld.z * 0.13, vWorld.z * 0.8);
    float wisp = noise(p + uOffset) * 0.7 + noise(p * 2.1 - uOffset) * 0.3;
    float alpha = edge * uOpacity * smoothstep(0.18, 0.8, wisp);
    gl_FragColor = vec4(uColour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
