import type { BufferGeometry, Object3D, Texture } from "three";
import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
} from "three";

import type { Vec3 } from "../../core/model/grid";
import type { City, CityId } from "../../overworld/model/city";
import {
  SETTLEMENT_EGGS_MODEL_IDS,
  SETTLEMENT_MODEL_IDS,
} from "../data/overworld-model-table";
import type { ModelLoader } from "../model/model-loader";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import type { TextTextureSource } from "../model/text-texture-source";
import type { RampStop } from "./infestation-ramp";
import { INFESTATION_RAMP, infestationColour } from "./infestation-ramp";

// The infestation ramp moved to `infestation-ramp.ts` when regions
// started sampling it too (#440). Re-exported so a marker stays the one
// place a caller needs for "how does a city look".
export type { RampStop };
export { INFESTATION_RAMP, infestationColour };

// ===========================================
// Constants
// ===========================================

/** Hovered pad tint: `ui-accent`. */
export const HOVER_COLOUR = 0xf08a24;

/** Selection ring colour: `tdf-orange`, the style guide's selection accent. */
export const SELECTION_COLOUR = 0xf08a24;

/** How much a hovered settlement grows. */
const HOVER_SCALE = 1.15;

/** Opacity of the thin infestation ring around a settlement; the ramp colour carries the reading. */
const HALO_OPACITY = 0.85;

/** Opacity of the ring while hovered: solid accent, so the hover is unmistakable. */
const HALO_HOVER_OPACITY = 1;

/**
 * Opacity of the soft glow band each ring casts on the ground around
 * it. Glows blend additively, so on the near-black map they read as
 * light rather than as a painted disc; hovering brightens the halo's.
 */
const GLOW_OPACITY = 0.16;
const GLOW_HOVER_OPACITY = 0.34;
const RING_GLOW_OPACITY = 0.22;

/** Opacity of the selection ring's thin core. */
const RING_OPACITY = 0.95;

/** Height the halo floats above the marker base so it never z-fights the ground lines. */
const HALO_LIFT = 0.004;

/** Height the ring floats above the halo. */
const RING_LIFT = 0.008;

/** Glows draw first, then the thin halo, then the selection ring, all before the models inside them. */
const GLOW_RENDER_ORDER = 0;
const HALO_RENDER_ORDER = 1;
const RING_RENDER_ORDER = 2;

/**
 * Label height in world units, and how far south of the settlement its
 * centre sits, as a share of the footprint: clear of the model's south
 * edge, the halo and the selection ring.
 */
const LABEL_HEIGHT = 0.34;
const LABEL_OFFSET_SOUTH = 1.15;

/** Height the label floats at so it never z-fights the halo. */
const LABEL_LIFT = 0.02;

/** Labels draw above everything else on the map. */
const LABEL_RENDER_ORDER = 4;

/** Stand-in block drawn without a model loader: a settlement-sized slab in `env-concrete`. */
const STAND_IN_COLOUR = 0x8e8a82;

/** Height of the stand-in block; the builder sizes its geometry from it. */
export const CITY_STAND_IN_HEIGHT = 0.25;

/** Prefix the model loader's fallback factory gives a placeholder's root name. */
const PLACEHOLDER_PREFIX = "placeholder:";

// ===========================================
// Types
// ===========================================

/** Geometries shared by every marker; the scene builder owns and disposes them. */
export interface CityMarkerGeometry {
  /** Thin flat ring around the settlement, tinted by infestation. */
  readonly halo: BufferGeometry;
  /** Wider, fainter band under the halo: its glow on the ground. */
  readonly haloGlow: BufferGeometry;
  /** Thin flat ring shown around a selected settlement. */
  readonly ring: BufferGeometry;
  /** Wider, fainter band under the selection ring: its glow. */
  readonly ringGlow: BufferGeometry;
  /** Invisible solid the pointer raycasts against, the settlement's footprint tall enough to hit. */
  readonly pick: BufferGeometry;
  /** Block drawn instead of a model when there is no loader. */
  readonly standIn: BufferGeometry;
}

/** How markers look: shared geometry and, when art is available, the models and label text. */
export interface CityMarkerLook {
  readonly geometry: CityMarkerGeometry;
  /** Resolves the settlement and egg models; `undefined` draws a stand-in block. */
  readonly models: ModelLoader | undefined;
  /** Rasterises the city's name; absent (or yielding nothing) draws no label. */
  readonly text?: TextTextureSource | undefined;
}

/** Which settlement visual a marker currently shows. */
export type CityModelState = "loading" | "glb" | "placeholder" | "stand-in";

/** What a marker currently shows, for tests and the dev hooks. */
export interface CityMarkerLookReport {
  /** Halo tint as `0xRRGGBB`; hover overrides infestation. */
  readonly colourHex: number;
  /** True while the egg overlay is shown for a mission on offer. */
  readonly mission: boolean;
  /** Whether the settlement is the GLB, the loader's placeholder, a stand-in, or still loading. */
  readonly model: CityModelState;
}

// ===========================================
// Marker
// ===========================================

/**
 * One city on the strategic map (#1155): the settlement model for its
 * scale inside a halo tinted by infestation, grown and accent-tinted
 * while hovered, ringed while selected, wearing the egg overlay while
 * an infestation-clearance mission is on offer there. Holds no game
 * truth; `setInfestation` and `setMission` are how state reaches it.
 *
 * ```
 *       ╭───────╮         ring, visible only when selected; thin, with a soft glow
 *       │ ╭───╮ │         halo: thin ring in the infestation ramp, or the accent
 *       │ │▟█▙│ │           while hovered, over a faint additive glow
 *       │ ╰───╯ │         settlement GLB (+ egg overlay while on offer)
 *       ╰───────╯
 *          name           label, south, while hovered or selected
 * ```
 *
 * Models arrive asynchronously through the loader; the pick solid,
 * halo and ring exist from construction so picking and highlights
 * never wait on a fetch. A load that lands after `dispose` is dropped.
 */
export class CityMarker {
  // ===========================================
  // Fields
  // ===========================================

  readonly cityId: CityId;
  /** Add this to the scene; it carries the visual, the halo and the ring. */
  readonly object: Group;
  /** The object raycasts hit: an invisible solid over the footprint. */
  readonly pickTarget: Object3D;
  /** The settlement and its egg overlay, scaled together while hovered. */
  private readonly visual: Group;
  private readonly halo: Mesh;
  private readonly haloMaterial: MeshBasicMaterial;
  private readonly haloGlowMaterial: MeshBasicMaterial;
  private readonly ring: Mesh;
  private readonly ringGlow: Mesh;
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly ringGlowMaterial: MeshBasicMaterial;
  private readonly standInMaterial: MeshBasicMaterial | undefined;
  private readonly label: Sprite | undefined;
  private readonly labelMaterial: SpriteMaterial | undefined;
  private readonly config: OverworldSceneConfig;
  private readonly models: ModelLoader | undefined;
  private readonly scale: City["scale"];
  private eggs: Object3D | undefined;
  private eggsLoad: Promise<Object3D> | undefined;
  private modelState: CityModelState;
  private infestationHex = 0;
  private hovered = false;
  private selected = false;
  private mission = false;
  private disposed = false;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param city - The city to represent; its id names the objects and its scale picks the model.
   * @param base - Point on the map plane the settlement stands on.
   * @param look - Shared geometry, the model loader and the label text source.
   * @param config - Marker sizes.
   */
  constructor(
    city: City,
    base: Vec3,
    look: CityMarkerLook,
    config: OverworldSceneConfig,
  ) {
    this.cityId = city.id;
    this.config = config;
    this.models = look.models;
    this.scale = city.scale;
    this.object = new Group();
    this.object.name = `city-${city.id}`;
    this.object.position.set(base.x, base.y, base.z);

    this.haloMaterial = new MeshBasicMaterial({
      transparent: true,
      opacity: HALO_OPACITY,
      depthWrite: false,
    });
    this.halo = flatRing(
      look.geometry.halo,
      this.haloMaterial,
      `city-halo-${city.id}`,
      HALO_LIFT,
      HALO_RENDER_ORDER,
    );
    this.object.add(this.halo);
    this.haloGlowMaterial = glowMaterial(GLOW_OPACITY);
    this.object.add(
      flatRing(
        look.geometry.haloGlow,
        this.haloGlowMaterial,
        `city-halo-glow-${city.id}`,
        HALO_LIFT,
        GLOW_RENDER_ORDER,
      ),
    );

    this.ringMaterial = new MeshBasicMaterial({
      color: SELECTION_COLOUR,
      transparent: true,
      opacity: RING_OPACITY,
      depthWrite: false,
    });
    this.ring = flatRing(
      look.geometry.ring,
      this.ringMaterial,
      `city-ring-${city.id}`,
      RING_LIFT,
      RING_RENDER_ORDER,
    );
    this.ring.visible = false;
    this.object.add(this.ring);
    this.ringGlowMaterial = glowMaterial(RING_GLOW_OPACITY);
    this.ringGlowMaterial.color.setHex(SELECTION_COLOUR);
    this.ringGlow = flatRing(
      look.geometry.ringGlow,
      this.ringGlowMaterial,
      `city-ring-glow-${city.id}`,
      RING_LIFT,
      GLOW_RENDER_ORDER,
    );
    this.ringGlow.visible = false;
    this.object.add(this.ringGlow);

    const pick = new Mesh(look.geometry.pick);
    pick.name = `city-body-${city.id}`;
    pick.position.y = config.markerPickHeight / 2;
    pick.visible = false;
    this.pickTarget = pick;
    this.object.add(pick);

    this.visual = new Group();
    this.visual.name = `city-visual-${city.id}`;
    this.object.add(this.visual);

    if (this.models) {
      this.modelState = "loading";
      void this.loadSettlement(this.models);
      this.standInMaterial = undefined;
    } else {
      this.modelState = "stand-in";
      this.standInMaterial = new MeshBasicMaterial({ color: STAND_IN_COLOUR });
      const block = new Mesh(look.geometry.standIn, this.standInMaterial);
      block.name = `city-stand-in-${city.id}`;
      block.position.y = CITY_STAND_IN_HEIGHT / 2;
      this.visual.add(block);
    }

    const labelTexture = look.text?.textTexture(city.name);
    if (labelTexture) {
      const material = new SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.scale.set(LABEL_HEIGHT * aspectOf(labelTexture), LABEL_HEIGHT, 1);
      // South of the settlement, on the ground plane: under the
      // strategic map's straight-down camera that reads as directly
      // below it (#439).
      sprite.position.set(
        0,
        LABEL_LIFT,
        this.config.settlementFootprint * LABEL_OFFSET_SOUTH,
      );
      sprite.renderOrder = LABEL_RENDER_ORDER;
      sprite.visible = false;
      sprite.name = `city-label-${city.id}`;
      this.label = sprite;
      this.labelMaterial = material;
      this.object.add(sprite);
    }

    this.setInfestation(city.infestation);
    this.setHovered(false);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** True when the settlement is a loaded model rather than the stand-in block. */
  usesModel(): boolean {
    return this.modelState === "glb" || this.modelState === "placeholder";
  }

  /** Retints the halo for the given infestation without rebuilding anything. */
  setInfestation(infestation: number): void {
    this.infestationHex = infestationColour(infestation);
    this.applyTint();
  }

  /** Grows the settlement and tints the halo with the accent while hovered. */
  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.refreshLabel();
    this.visual.scale.setScalar(hovered ? HOVER_SCALE : 1);
    this.applyTint();
  }

  /** Shows the selection ring while selected. */
  setSelected(selected: boolean): void {
    this.selected = selected;
    this.ring.visible = selected;
    this.ringGlow.visible = selected;
    this.refreshLabel();
  }

  /** True while the city's name is on screen. */
  labelVisible(): boolean {
    return this.label?.visible ?? false;
  }

  /**
   * Adds the egg overlay while a clearance mission is on offer and
   * removes it when the mission is gone. The overlay is fetched on
   * first use and kept for the marker's life, so toggling is free.
   */
  setMission(active: boolean): void {
    this.mission = active;
    if (active) {
      void this.showEggs();
    } else {
      this.eggs?.removeFromParent();
    }
  }

  /** True while the egg overlay is wanted. */
  hasMission(): boolean {
    return this.mission;
  }

  /** Current halo tint as `0xRRGGBB`, for tests and debug readouts. */
  colourHex(): number {
    return this.haloMaterial.color.getHex();
  }

  /** Tint, egg cue and model state together, for tests and the dev hooks. */
  look(): CityMarkerLookReport {
    return {
      colourHex: this.colourHex(),
      mission: this.mission,
      model: this.modelState,
    };
  }

  /**
   * A world-space point for projecting to the screen: the marker's
   * anchor, which is its city's own position, so a projected marker
   * lands on its city rather than beside it (#420). Call after the
   * scene's world matrices are up to date.
   */
  pickPoint(): Vec3 {
    const base = this.object.getWorldPosition(this.object.position.clone());
    return { x: base.x, y: base.y, z: base.z };
  }

  /**
   * Releases the marker's own materials and drops any load still in
   * flight. Model geometry and materials belong to the loader; the
   * label texture belongs to the text source.
   */
  dispose(): void {
    this.disposed = true;
    this.haloMaterial.dispose();
    this.haloGlowMaterial.dispose();
    this.ringMaterial.dispose();
    this.ringGlowMaterial.dispose();
    this.standInMaterial?.dispose();
    this.labelMaterial?.dispose();
    this.visual.clear();
    this.eggs = undefined;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Fetches the settlement model for the city's scale and stands it on the pad. */
  private async loadSettlement(models: ModelLoader): Promise<void> {
    const model = await models.load(SETTLEMENT_MODEL_IDS[this.scale]);
    if (this.disposed) {
      return;
    }
    this.modelState = isPlaceholder(model) ? "placeholder" : "glb";
    model.name = `city-settlement-${this.cityId}`;
    this.visual.add(model);
  }

  /** Fetches the egg overlay once and adds it while the mission is still wanted. */
  private async showEggs(): Promise<void> {
    if (!this.models) {
      return;
    }
    this.eggsLoad ??= this.models.load(SETTLEMENT_EGGS_MODEL_IDS[this.scale]);
    const eggs = await this.eggsLoad;
    if (this.disposed || !this.mission) {
      return;
    }
    eggs.name = `city-eggs-${this.cityId}`;
    this.eggs = eggs;
    this.visual.add(eggs);
  }

  /**
   * A city's name is shown while it is hovered or selected, and only
   * then: thirty-seven names at once is the clutter the placeholder
   * label bars were already causing (#439).
   */
  private refreshLabel(): void {
    if (this.label) {
      this.label.visible = this.hovered || this.selected;
    }
  }

  /** Pushes the hover or infestation colour onto the halo and its glow. */
  private applyTint(): void {
    const hex = this.hovered ? HOVER_COLOUR : this.infestationHex;
    this.haloMaterial.color.setHex(hex);
    this.haloMaterial.opacity = this.hovered
      ? HALO_HOVER_OPACITY
      : HALO_OPACITY;
    this.haloGlowMaterial.color.setHex(hex);
    this.haloGlowMaterial.opacity = this.hovered
      ? GLOW_HOVER_OPACITY
      : GLOW_OPACITY;
  }
}

// ===========================================
// Helpers
// ===========================================

/** A ring mesh laid flat on the ground plane, lifted and ordered as given. */
function flatRing(
  geometry: BufferGeometry,
  material: MeshBasicMaterial,
  name: string,
  lift: number,
  renderOrder: number,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = lift;
  mesh.renderOrder = renderOrder;
  return mesh;
}

/**
 * The material a glow band is drawn with: additive, so it lightens the
 * ground under it the way light does rather than painting a disc over
 * the map's lines.
 */
function glowMaterial(opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    transparent: true,
    opacity,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** True for the box the loader's fallback factory hands out when a GLB failed. */
function isPlaceholder(model: Object3D): boolean {
  return model.name.startsWith(PLACEHOLDER_PREFIX);
}

/**
 * Width over height of a rasterised label, so a sprite wearing it is not
 * stretched. Falls back to square for a texture with no measurable image
 * (a stub in tests).
 */
function aspectOf(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | null;
  const width = image?.width ?? 1;
  const height = image?.height ?? 1;
  return height > 0 ? width / height : 1;
}
