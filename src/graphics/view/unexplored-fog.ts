import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
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
import {
  MIST_PATTERN,
  withUnexploredMist,
} from "../service/unexplored-fog-material";
import {
  UNEXPLORED_FOG_COLOUR,
  UNEXPLORED_FOG_LAYERS,
  UNEXPLORED_FOG_STRENGTH,
} from "../data/unexplored-fog";
import type { SideVision } from "../../tactical/model/tactical-state";
import { gridKey } from "../../core/service/grid-math";
import { LEVEL_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import type { Disposable } from "../model/disposable";

// ===========================================
// Appearance
// ===========================================

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
 * Air sheets never write depth, cast shadows, intercept picking, or use
 * DOM. Terrain materials continue the mist above the sheets while keeping
 * their existing depth, shadow, and picking behaviour.
 */
export class UnexploredFog implements Disposable {
  // ===========================================
  // Fields and construction
  // ===========================================

  private readonly levels = new Map<number, FogLevel>();
  private readonly geometry: PlaneGeometry;
  private readonly materials: ShaderMaterial[] = [];
  private readonly surfaces: {
    coverage: BufferAttribute;
    keys: readonly number[];
  }[] = [];
  private readonly surfaceResources: Disposable[] = [];
  private known: ReadonlySet<number> | undefined;

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

  /** Gives every terrain mesh its own coverage attribute and mist material. */
  trackSurface(mesh: Mesh, keys: readonly number[]): void {
    const geometry = mesh.geometry.clone();
    const ownerKeys =
      mesh instanceof InstancedMesh
        ? keys
        : Array.from(
            { length: geometry.getAttribute("position").count },
            () => keys[0]!,
          );
    const data = new Float32Array(ownerKeys.length * 4);
    ownerKeys.forEach((key, i) => {
      const level = Math.floor(key / (this.map.width * this.map.depth));
      const x = key % this.map.width;
      const z = Math.floor(key / this.map.width) % this.map.depth;
      data.set(
        [x + 0.5, z + 0.5, level * LEVEL_HEIGHT + SLAB_HEIGHT, 0],
        i * 4,
      );
    });
    const coverage =
      mesh instanceof InstancedMesh
        ? new InstancedBufferAttribute(data, 4)
        : new BufferAttribute(data, 4);
    geometry.setAttribute("unexploredMist", coverage);
    mesh.geometry = geometry;
    const materials = (
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    ).map(withUnexploredMist);
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!;
    this.surfaceResources.push(geometry, ...materials);
    this.surfaces.push({ coverage, keys: ownerKeys });
    this.updateSurface(coverage, ownerKeys);
  }

  /** Clears mist permanently on explored tiles, including after they leave sight. */
  setVision(vision: SideVision | undefined): void {
    const known = new Set(vision?.explored);
    for (const key of vision?.visible ?? []) known.add(key);
    this.known = vision === undefined ? undefined : known;
    for (const surface of this.surfaces)
      this.updateSurface(surface.coverage, surface.keys);
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
    for (const resource of this.surfaceResources) resource.dispose();
  }

  // ===========================================
  // Level construction
  // ===========================================

  /** Writes per-owner exploration, also for geometry loaded after vision was set. */
  private updateSurface(
    coverage: BufferAttribute,
    keys: readonly number[],
  ): void {
    keys.forEach((key, i) =>
      coverage.setW(
        i,
        this.known !== undefined && !this.known.has(key) ? 1 : 0,
      ),
    );
    coverage.needsUpdate = true;
  }

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
    for (const lift of UNEXPLORED_FOG_LAYERS) {
      const material = new ShaderMaterial({
        uniforms: {
          uMask: { value: mask },
          uSize: { value: new Vector2(width, depth) },
          uColour: { value: new Color(UNEXPLORED_FOG_COLOUR) },
          uOpacity: { value: UNEXPLORED_FOG_STRENGTH },
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

  ${MIST_PATTERN}
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
    float alpha = edge * uOpacity * mistWisp(vWorld.xz, uOffset);
    gl_FragColor = vec4(uColour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
