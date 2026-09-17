import type { BufferGeometry, Material, Object3D, Texture, Color } from "three";
import { Group, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial } from "three";

import type { Vec3 } from "../../core/model/grid";
import type {
  Deployable,
  DeployableId,
} from "../../overworld/model/deployable";
import type { DeployableTypeId } from "../../overworld/model/deployable-type";
import {
  DEPLOYABLE_ANIMATED_NODE,
  DEPLOYABLE_MODEL_IDS,
} from "../data/overworld-model-table";
import type { DeployableAnimation } from "../model/deployable-animation";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { ModelLoader } from "../model/model-loader";
import type { TextTextureSource } from "../model/text-texture-source";
import { textureAspect } from "../service/texture-aspect";
import { SprayPuffs } from "./spray-puffs";

// ===========================================
// Constants
// ===========================================

/** Opacity of an offline installation's materials; online ones are opaque. */
export const OFFLINE_OPACITY = 0.45;

/** How much an offline installation's colours are darkened, as a multiplier. */
export const OFFLINE_DIM = 0.55;

/** Stand-in block drawn without a model loader: `env-concrete`. */
const STAND_IN_COLOUR = 0x8e8a82;

/** Height of the stand-in block; the builder sizes its geometry from it. */
export const INSTALLATION_STAND_IN_HEIGHT = 0.29;

/** Prefix the model loader's fallback factory gives a placeholder's root name. */
const PLACEHOLDER_PREFIX = "placeholder:";

/** How much a hovered installation grows, so the pointer's find reads on the map. */
export const INSTALLATION_HOVER_SCALE = 1.15;

/** Name label height in world units; a touch under the city label so the type name reads as a caption. */
const LABEL_HEIGHT = 0.16;

/** Height the label floats at so it never z-fights the model's base. */
const LABEL_LIFT = 0.02;

/** How far south of the installation its name sits, in footprints. */
const LABEL_OFFSET_SOUTH = 0.9;

/** Draw order of the label: after everything, like the city names (#1155). */
const LABEL_RENDER_ORDER = 100;

// ===========================================
// Types
// ===========================================

/** How installations look: the models, the per-type idle and what the spray is cut from. */
export interface InstallationLook {
  /** Resolves installation models; `undefined` draws a stand-in block. */
  readonly models: ModelLoader | undefined;
  /** How each type's `animated` node idles. */
  readonly animations: Readonly<Record<DeployableTypeId, DeployableAnimation>>;
  /** Soft disc the spray's puffs are cut from; owned by the builder. */
  readonly falloff: Texture;
  /** Block drawn instead of a model when there is no loader; owned by the builder. */
  readonly standIn: BufferGeometry;
  /** Invisible solid the pointer raycasts against; owned by the builder. */
  readonly pick: BufferGeometry;
  /** Side of the square footprint the models are authored on; places the label. */
  readonly footprint: number;
  /** Rasterises the type name for the hover label; absent draws no label. */
  readonly text?: TextTextureSource | undefined;
  /** The display name of each type, for the label; absent labels with the type id. */
  readonly nameOf?: (typeId: DeployableTypeId) => string;
}

/** Which installation visual a marker currently shows. */
export type InstallationModelState =
  "loading" | "glb" | "placeholder" | "stand-in";

/** What an installation currently shows, for tests and the dev hooks. */
export interface InstallationLookReport {
  readonly typeId: DeployableTypeId;
  /** True while drawn at full strength; offline installations are dimmed. */
  readonly online: boolean;
  /** Whether the model is the GLB, the loader's placeholder, a stand-in, or still loading. */
  readonly model: InstallationModelState;
  /** Current yaw of the `animated` node in radians, or `undefined` while there is none to turn. */
  readonly animatedYaw: number | undefined;
  /** True while a spray of puffs is attached to the moving part. */
  readonly spraying: boolean;
  /** True while the name label is drawn: hovered or selected. */
  readonly labelVisible: boolean;
}

/** A material the marker dimmed, with the colour to restore. */
interface OwnedMaterial {
  readonly material: Material & { color?: Color; opacity: number };
  readonly colour: Color | undefined;
}

// ===========================================
// Installation marker
// ===========================================

/**
 * One built installation on the strategic map (#1155): the model for
 * its type at a slot in its region, idling on its `animated` node
 * every frame, dimmed rather than hidden while offline so the player
 * sees what upkeep they are not paying for. Holds no game truth;
 * `setOnline` is how state reaches it.
 *
 * ```
 *   new InstallationMarker(deployable, at, look)  ──► model fetched, stood at `at`
 *   setOnline(false)                             ──► materials darkened and made translucent
 *   setHovered(true) / setSelected(true)         ──► model grown, name label shown
 *   update(dt)                                   ──► `animated` yawed per the type's animation
 * ```
 *
 * An invisible pick solid the size of the footprint stands under the
 * model, so the pointer hits the same volume whether the GLB has
 * loaded, failed or is a stand-in block (#1155).
 *
 * A clone from the loader shares its materials with every other clone,
 * so dimming replaces them with copies this marker owns and disposes.
 */
export class InstallationMarker implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: DeployableId;
  readonly typeId: DeployableTypeId;
  /** Add this to the scene; it carries the model. */
  readonly object: Group;
  /** Raycast this to hit-test the installation; the scene maps it back to the id. */
  readonly pickTarget: Object3D;
  private readonly animation: DeployableAnimation;
  /** The model or stand-in, grown while hovered; the label and pick solid stay put. */
  private readonly visual: Group;
  private readonly label: Sprite | undefined;
  private readonly labelMaterial: SpriteMaterial | undefined;
  private hovered = false;
  private selected = false;
  private readonly falloff: Texture;
  private readonly owned: OwnedMaterial[] = [];
  private standInMaterial: MeshBasicMaterial | undefined;
  private animated: Object3D | undefined;
  private spray: SprayPuffs | undefined;
  private modelState: InstallationModelState;
  private online = true;
  private clock = 0;
  private disposed = false;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param deployable - The installation to draw; its type picks the model and the idle.
   * @param at - Where it stands on the map plane, in world units.
   * @param look - Model loader, animations, spray texture and stand-in geometry.
   */
  constructor(deployable: Deployable, at: Vec3, look: InstallationLook) {
    this.id = deployable.id;
    this.typeId = deployable.typeId;
    this.animation = look.animations[deployable.typeId];
    this.falloff = look.falloff;
    this.object = new Group();
    this.object.name = `installation-${deployable.id}`;
    this.object.position.set(at.x, at.y, at.z);

    const pick = new Mesh(look.pick);
    pick.name = `installation-body-${deployable.id}`;
    pick.visible = false;
    this.pickTarget = pick;
    this.object.add(pick);

    this.visual = new Group();
    this.visual.name = `installation-visual-${deployable.id}`;
    this.object.add(this.visual);

    if (look.models) {
      this.modelState = "loading";
      void this.loadModel(look.models);
    } else {
      this.modelState = "stand-in";
      this.standInMaterial = new MeshBasicMaterial({ color: STAND_IN_COLOUR });
      const block = new Mesh(look.standIn, this.standInMaterial);
      block.name = `installation-stand-in-${deployable.id}`;
      block.position.y = INSTALLATION_STAND_IN_HEIGHT / 2;
      this.visual.add(block);
      this.owned.push({
        material: this.standInMaterial,
        colour: this.standInMaterial.color.clone(),
      });
    }

    const name = look.nameOf?.(deployable.typeId) ?? deployable.typeId;
    const labelTexture = look.text?.textTexture(name);
    if (labelTexture) {
      // A cue, not a thing in the scene: ignores depth and draws last,
      // like the city names, so no neighbour stands in front of it.
      const material = new SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.scale.set(
        LABEL_HEIGHT * textureAspect(labelTexture),
        LABEL_HEIGHT,
        1,
      );
      sprite.position.set(0, LABEL_LIFT, look.footprint * LABEL_OFFSET_SOUTH);
      sprite.renderOrder = LABEL_RENDER_ORDER;
      sprite.visible = false;
      sprite.name = `installation-label-${deployable.id}`;
      this.label = sprite;
      this.labelMaterial = material;
      this.object.add(sprite);
    }
    this.setOnline(deployable.online);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Moves the marker to another slot without reloading anything. */
  moveTo(at: Vec3): void {
    this.object.position.set(at.x, at.y, at.z);
  }

  /** Draws the installation at full strength while online, dimmed while not. */
  setOnline(online: boolean): void {
    this.online = online;
    this.applyStrength();
  }

  /** Grows the model and shows its name while the pointer rests on it. */
  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.visual.scale.setScalar(hovered ? INSTALLATION_HOVER_SCALE : 1);
    this.refreshCues();
  }

  /** Keeps the name shown while the installation is the one picked. */
  setSelected(selected: boolean): void {
    this.selected = selected;
    this.refreshCues();
  }

  /** Turns the `animated` node on by the type's idle and drifts the spray. */
  update(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    if (this.animated) {
      this.animated.rotation.y = yawAt(this.animation, this.clock);
    }
    this.spray?.update(deltaSeconds);
  }

  /** What the installation currently shows, for tests and the dev hooks. */
  look(): InstallationLookReport {
    return {
      typeId: this.typeId,
      online: this.online,
      model: this.modelState,
      animatedYaw: this.animated?.rotation.y,
      spraying: this.spray !== undefined,
      labelVisible: this.label?.visible ?? false,
    };
  }

  /**
   * Frees the materials this marker owns, the spray, and detaches the
   * object; drops a load still in flight. Model geometry and the
   * loader's own materials stay the loader's.
   */
  dispose(): void {
    this.disposed = true;
    this.spray?.dispose();
    this.spray = undefined;
    for (const { material } of this.owned) {
      material.dispose();
    }
    this.owned.length = 0;
    this.standInMaterial = undefined;
    this.animated = undefined;
    // The label texture belongs to the text source; only the material is ours.
    this.labelMaterial?.dispose();
    this.object.clear();
    this.object.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Fetches the type's model, takes ownership of its materials and finds its moving part. */
  private async loadModel(models: ModelLoader): Promise<void> {
    const model = await models.load(DEPLOYABLE_MODEL_IDS[this.typeId]);
    if (this.disposed) {
      return;
    }
    this.modelState = isPlaceholder(model) ? "placeholder" : "glb";
    model.name = `installation-model-${this.id}`;
    this.ownMaterials(model);
    this.visual.add(model);
    this.animated = model.getObjectByName(DEPLOYABLE_ANIMATED_NODE);
    if (
      this.animated &&
      this.animation.kind === "sweep" &&
      this.animation.spray
    ) {
      this.spray = new SprayPuffs(
        this.animation.spray,
        this.falloff,
        `installation-spray-${this.id}`,
      );
      this.animated.add(this.spray.root);
    }
    this.applyStrength();
  }

  /** Replaces every mesh material under `model` with a copy this marker owns. */
  private ownMaterials(model: Object3D): void {
    model.traverse((node) => {
      if (!(node instanceof Mesh)) {
        return;
      }
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      const copies = materials.map((material: Material) => {
        const copy = material.clone() as OwnedMaterial["material"];
        this.owned.push({ material: copy, colour: copy.color?.clone() });
        return copy;
      });
      node.material = Array.isArray(node.material) ? copies : copies[0];
    });
  }

  /** Pushes the online or offline strength onto every owned material. */
  private applyStrength(): void {
    for (const { material, colour } of this.owned) {
      if (this.online) {
        material.transparent = false;
        material.opacity = 1;
        if (colour && material.color) {
          material.color.copy(colour);
        }
      } else {
        material.transparent = true;
        material.opacity = OFFLINE_OPACITY;
        if (colour && material.color) {
          material.color.copy(colour).multiplyScalar(OFFLINE_DIM);
        }
      }
      material.needsUpdate = true;
    }
    if (this.spray) {
      this.spray.root.visible = this.online;
    }
  }

  /** The name follows hover and selection, and only those: no label on an installation nobody is looking at. */
  private refreshCues(): void {
    if (this.label) {
      this.label.visible = this.hovered || this.selected;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** The `animated` node's yaw at time `t` for an animation. */
export function yawAt(animation: DeployableAnimation, t: number): number {
  switch (animation.kind) {
    case "spin":
      return (animation.radiansPerSecond * t) % (2 * Math.PI);
    case "sweep":
      return animation.arc * Math.sin(animation.phaseRate * t);
  }
}

/** True for the box the loader's fallback factory hands out when a GLB failed. */
function isPlaceholder(model: Object3D): boolean {
  return model.name.startsWith(PLACEHOLDER_PREFIX);
}
