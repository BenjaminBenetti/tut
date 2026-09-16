import type { BufferGeometry, Object3D, Texture } from "three";
import { Group, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial } from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { Vec3 } from "../../core/model/grid";
import type { City, CityId } from "../../overworld/model/city";
import {
  settlementEggsModelId,
  settlementModelId,
} from "../data/overworld-model-table";
import type { ModelLoader } from "../model/model-loader";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import type {
  SettlementStyleId,
  SettlementStyleSource,
} from "../model/settlement-style";
import type { SettlementVariation } from "../model/settlement-variation";
import type { TextTextureSource } from "../model/text-texture-source";
import { settlementVariation } from "../service/settlement-variation";

// ===========================================
// Constants
// ===========================================

/** Corner-bracket colour: `tdf-orange`, the style guide's selection accent. */
export const SELECTION_COLOUR = 0xf08a24;

/** How much a hovered settlement grows. */
const HOVER_SCALE = 1.12;

/** Bracket opacity while selected, and the fainter cue while merely hovered. */
const BRACKET_OPACITY = 0.95;
const BRACKET_HOVER_OPACITY = 0.4;

/** Height the brackets float above the marker base so they never z-fight the ground lines. */
const BRACKET_LIFT = 0.006;

/**
 * Draw order of the hover and selection cues. Both ignore the depth
 * buffer, so a taller neighbour can never hide them behind its
 * skyline, and both draw after everything else so the order among
 * them is fixed: brackets under the label. The highest order anywhere
 * else in the graphics tree is the radar marks at 20 (tactical); on
 * the strategic map nothing exceeds the puffs at 8, and the models
 * themselves draw at 0.
 *
 * ```
 *   100  label      depthTest off
 *    90  brackets   depthTest off
 *     8  puffs
 *     1  territories
 *     0  models, fill
 * ```
 */
export const BRACKET_RENDER_ORDER = 90;
export const LABEL_RENDER_ORDER = 100;

/**
 * Label height in world units, and how far south of the settlement its
 * centre sits, as a share of the footprint: clear of the model's south
 * edge and the brackets.
 */
const LABEL_HEIGHT = 0.34;
const LABEL_OFFSET_SOUTH = 1.05;

/** Height the label floats at so it never z-fights the brackets. */
const LABEL_LIFT = 0.02;

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
  /** Four thin L-shaped corner brackets laid flat around the footprint, shown while hovered or selected. */
  readonly brackets: BufferGeometry;
  /** Invisible solid the pointer raycasts against, the settlement's footprint tall enough to hit. */
  readonly pick: BufferGeometry;
  /** Block drawn instead of a model when there is no loader. */
  readonly standIn: BufferGeometry;
}

/** How markers look: shared geometry, the style table and, when art is available, the models and label text. */
export interface CityMarkerLook {
  readonly geometry: CityMarkerGeometry;
  /** Which architectural family a city's region draws in. */
  readonly styles: SettlementStyleSource;
  /** Resolves the settlement and egg models; `undefined` draws a stand-in block. */
  readonly models: ModelLoader | undefined;
  /** Rasterises the city's name; absent (or yielding nothing) draws no label. */
  readonly text?: TextTextureSource | undefined;
}

/** Which settlement visual a marker currently shows. */
export type CityModelState = "loading" | "glb" | "placeholder" | "stand-in";

/** What a marker currently shows, for tests and the dev hooks. */
export interface CityMarkerLookReport {
  /** True while the egg overlay is shown for a mission on offer. */
  readonly mission: boolean;
  /** Whether the settlement is the GLB, the loader's placeholder, a stand-in, or still loading. */
  readonly model: CityModelState;
  /** The settlement model the marker asks for: its region's style at its scale. */
  readonly modelId: ModelAssetId;
  /** The architectural family the model belongs to. */
  readonly style: SettlementStyleId;
  /** The per-city variation applied to the model. */
  readonly variation: SettlementVariation;
}

// ===========================================
// Marker
// ===========================================

/**
 * One city on the strategic map (#1155): the settlement model for its
 * region's style and its scale, standing directly on the map plane,
 * varied per city (mirror, yaw, height) so no two look alike, grown a
 * little while hovered, framed by thin orange corner brackets while
 * hovered (faint) or selected (solid), and wearing the egg overlay
 * while an infestation-clearance mission is on offer there. Holds no
 * game truth; `setMission` is how state reaches it. Infestation is not
 * shown on the marker: the region fill carries it.
 *
 * ```
 *       ┌         ┐      brackets: faint while hovered, solid while selected
 *          ▟█▙           settlement GLB (+ egg overlay while on offer),
 *         ▟███▙            mirrored / yawed / stretched per city
 *       └         ┘
 *          name          label, south, while hovered or selected
 * ```
 *
 * Brackets and label ignore the depth buffer and draw after every
 * other object, so a neighbouring skyline never hides them.
 *
 * Models arrive asynchronously through the loader; the pick solid and
 * brackets exist from construction so picking and highlights never
 * wait on a fetch. A load that lands after `dispose` is dropped.
 */
export class CityMarker {
  // ===========================================
  // Fields
  // ===========================================

  readonly cityId: CityId;
  /** Add this to the scene; it carries the visual, the brackets and the label. */
  readonly object: Group;
  /** The object raycasts hit: an invisible solid over the footprint. */
  readonly pickTarget: Object3D;
  /** Grows while hovered; holds the varied model group. */
  private readonly visual: Group;
  /** Carries the per-city mirror, yaw and height; the settlement and its eggs sit inside. */
  private readonly variant: Group;
  private readonly brackets: Mesh;
  private readonly bracketMaterial: MeshBasicMaterial;
  private readonly standInMaterial: MeshBasicMaterial | undefined;
  private readonly label: Sprite | undefined;
  private readonly labelMaterial: SpriteMaterial | undefined;
  private readonly config: OverworldSceneConfig;
  private readonly models: ModelLoader | undefined;
  private readonly style: SettlementStyleId;
  private readonly scale: City["scale"];
  private readonly variation: SettlementVariation;
  private eggs: Object3D | undefined;
  private eggsLoad: Promise<Object3D> | undefined;
  private modelState: CityModelState;
  private hovered = false;
  private selected = false;
  private mission = false;
  private disposed = false;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param city - The city to represent; its id names the objects and seeds the variation, its region picks the style, its scale the model.
   * @param base - Point on the map plane the settlement stands on.
   * @param look - Shared geometry, the style table, the model loader and the label text source.
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
    this.style = look.styles.styleFor(city.regionId);
    this.scale = city.scale;
    this.variation = settlementVariation(city.id);
    this.object = new Group();
    this.object.name = `city-${city.id}`;
    this.object.position.set(base.x, base.y, base.z);

    this.bracketMaterial = new MeshBasicMaterial({
      color: SELECTION_COLOUR,
      transparent: true,
      opacity: BRACKET_OPACITY,
      depthTest: false,
      depthWrite: false,
    });
    this.brackets = new Mesh(look.geometry.brackets, this.bracketMaterial);
    this.brackets.name = `city-brackets-${city.id}`;
    this.brackets.rotation.x = -Math.PI / 2;
    this.brackets.position.y = BRACKET_LIFT;
    this.brackets.renderOrder = BRACKET_RENDER_ORDER;
    this.brackets.visible = false;
    this.object.add(this.brackets);

    const pick = new Mesh(look.geometry.pick);
    pick.name = `city-body-${city.id}`;
    pick.position.y = config.markerPickHeight / 2;
    pick.visible = false;
    this.pickTarget = pick;
    this.object.add(pick);

    this.visual = new Group();
    this.visual.name = `city-visual-${city.id}`;
    this.object.add(this.visual);
    this.variant = new Group();
    this.variant.name = `city-variant-${city.id}`;
    this.variant.rotation.y = this.variation.yaw;
    this.variant.scale.set(
      this.variation.mirrored ? -1 : 1,
      this.variation.heightScale,
      1,
    );
    this.visual.add(this.variant);

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
      this.variant.add(block);
    }

    const labelTexture = look.text?.textTexture(city.name);
    if (labelTexture) {
      // The name is a cue, not a thing in the scene: it ignores depth
      // so the city south of the hovered one cannot stand in front of
      // it, and draws last (#1155).
      const material = new SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.scale.set(LABEL_HEIGHT * aspectOf(labelTexture), LABEL_HEIGHT, 1);
      // South of the settlement, on the ground plane: under the
      // strategic map's camera that reads as directly below it (#439).
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

    this.setHovered(false);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** True when the settlement is a loaded model rather than the stand-in block. */
  usesModel(): boolean {
    return this.modelState === "glb" || this.modelState === "placeholder";
  }

  /** Grows the settlement and shows faint brackets while hovered. */
  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.visual.scale.setScalar(hovered ? HOVER_SCALE : 1);
    this.refreshCues();
  }

  /** Shows solid brackets and the name while selected. */
  setSelected(selected: boolean): void {
    this.selected = selected;
    this.refreshCues();
  }

  /** True while the city's name is on screen. */
  labelVisible(): boolean {
    return this.label?.visible ?? false;
  }

  /** True while the corner brackets are drawn. */
  bracketsVisible(): boolean {
    return this.brackets.visible;
  }

  /** Current bracket opacity, for tests: solid when selected, faint when only hovered. */
  bracketOpacity(): number {
    return this.bracketMaterial.opacity;
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

  /** Egg cue, model state, model id, style and variation together, for tests and the dev hooks. */
  look(): CityMarkerLookReport {
    return {
      mission: this.mission,
      model: this.modelState,
      modelId: settlementModelId(this.style, this.scale),
      style: this.style,
      variation: this.variation,
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
    this.bracketMaterial.dispose();
    this.standInMaterial?.dispose();
    this.labelMaterial?.dispose();
    this.variant.clear();
    this.eggs = undefined;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Fetches the settlement model for the city's style and scale and stands it in the variant group. */
  private async loadSettlement(models: ModelLoader): Promise<void> {
    const model = await models.load(settlementModelId(this.style, this.scale));
    if (this.disposed) {
      return;
    }
    this.modelState = isPlaceholder(model) ? "placeholder" : "glb";
    model.name = `city-settlement-${this.cityId}`;
    this.variant.add(model);
  }

  /** Fetches the egg overlay once and adds it while the mission is still wanted. */
  private async showEggs(): Promise<void> {
    if (!this.models) {
      return;
    }
    this.eggsLoad ??= this.models.load(
      settlementEggsModelId(this.style, this.scale),
    );
    const eggs = await this.eggsLoad;
    if (this.disposed || !this.mission) {
      return;
    }
    eggs.name = `city-eggs-${this.cityId}`;
    this.eggs = eggs;
    this.variant.add(eggs);
  }

  /**
   * Brackets and name follow hover and selection, and only those:
   * nothing is drawn around a city nobody is looking at, and
   * thirty-seven names at once is the clutter the placeholder label
   * bars were already causing (#439). Selection wins over hover for
   * the bracket opacity.
   */
  private refreshCues(): void {
    const wanted = this.hovered || this.selected;
    this.brackets.visible = wanted;
    this.bracketMaterial.opacity = this.selected
      ? BRACKET_OPACITY
      : BRACKET_HOVER_OPACITY;
    if (this.label) {
      this.label.visible = wanted;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

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
