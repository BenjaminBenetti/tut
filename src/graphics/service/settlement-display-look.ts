import type { BufferGeometry, Material, Object3D } from "three";
import type { Mesh } from "three";
import {
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import { SETTLEMENT_DISPLAY_TUNING } from "../data/settlement-display-tuning";
import { isSettlementModelId } from "../data/overworld-model-table";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { ModelDresser } from "../model/model-dresser";
import type { SettlementDisplayTuning } from "../model/settlement-display-look";

// ===========================================
// Constants
// ===========================================

/** Authored material names (style guide §4) mapped to the display classes. */
const WINDOW_TOKEN = "env-window-lit";
const BEACON_TOKEN = "tdf-orange";
const ACCENT_TOKEN = "tdf-visor";
const FOLIAGE_TOKENS: ReadonlySet<string> = new Set([
  "env-foliage",
  "env-tropical-leaf",
  "env-tropical-leaf-light",
  "env-scrub",
  "env-sclerophyll-leaf",
  "env-sclerophyll-leaf-light",
  "env-palm-trunk",
  "env-tuart-bark",
  "env-grass-tree-trunk",
]);

/** Name given to every edge overlay, for tests and scene inspection. */
export const SETTLEMENT_EDGES_NAME = "settlement-edges";

/**
 * Bodies are pushed back a hair in depth so the edge lines on their
 * surface win the depth test instead of stippling against it.
 */
const BODY_POLYGON_OFFSET = 1;

// ===========================================
// Types
// ===========================================

/** The display class a material falls in. */
type DisplayClass = "body" | "foliage" | "window" | "beacon" | "accent";

// ===========================================
// Look
// ===========================================

/**
 * Dresses the settlement models for the WarGames map (#1155). The GLBs
 * are authored in the full environment palette so the regional styles
 * stay legible in their own renders and concept sheets; on the strategic
 * map that palette clashes with a monochrome cyan vector display, so
 * every settlement is restyled once as it loads:
 *
 * ```
 *   ┌───────────────┐    dress()    ┌───────────────┐
 *   │ ochre roofs   │ ────────────▶ │ dark navy     │  bodyColour, lit
 *   │ sand walls    │               │ + cyan edges  │  EdgesGeometry ≥ threshold
 *   │ warm windows  │               │ dim cyan dots │  windowColour, unlit
 *   │ green trees   │               │ dark forms    │  foliageColour, no edges
 *   │ orange beacon │               │ orange beacon │  kept, unlit
 *   └───────────────┘               └───────────────┘
 * ```
 *
 * The egg overlays keep their russet and magenta so the mission cue
 * still pops, and every other model (installations, tactical assets)
 * passes through untouched. One material per class is shared by all
 * sixty models, and one edge material by every edge overlay, so
 * `setZoom` retunes every city's edges in one write: faint at the
 * world zoom, where a city is a couple of dozen pixels and dense
 * lines would turn to noise, full strength close in.
 */
export class SettlementDisplayLook implements ModelDresser, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly tuning: SettlementDisplayTuning;
  private readonly materials: Readonly<Record<DisplayClass, Material>>;
  private readonly edgeMaterial: LineBasicMaterial;
  private readonly edgeGeometries: BufferGeometry[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Tones and edge fade; defaults to the shipped tuning. */
  constructor(tuning: SettlementDisplayTuning = SETTLEMENT_DISPLAY_TUNING) {
    this.tuning = tuning;
    this.materials = {
      body: named(
        new MeshLambertMaterial({
          color: tuning.bodyColour,
          polygonOffset: true,
          polygonOffsetFactor: BODY_POLYGON_OFFSET,
          polygonOffsetUnits: BODY_POLYGON_OFFSET,
        }),
        "settlement-body",
      ),
      foliage: named(
        new MeshLambertMaterial({ color: tuning.foliageColour }),
        "settlement-foliage",
      ),
      window: named(
        new MeshBasicMaterial({ color: tuning.windowColour }),
        "settlement-window",
      ),
      beacon: named(
        new MeshBasicMaterial({ color: tuning.beaconColour }),
        "settlement-beacon",
      ),
      accent: named(
        new MeshBasicMaterial({ color: tuning.accentColour }),
        "settlement-accent",
      ),
    };
    this.edgeMaterial = named(
      new LineBasicMaterial({
        color: tuning.edgeColour,
        transparent: true,
        opacity: tuning.edgeOpacityFar,
        depthWrite: false,
      }),
      "settlement-edge",
    );
  }

  // ===========================================
  // ModelDresser
  // ===========================================

  /**
   * Restyles a settlement model in place; any other id is left alone.
   * Each mesh's authored material is swapped for the shared material of
   * its class and released, and every body mesh gets an edge overlay as
   * a child so it follows the mesh's own transform.
   */
  dress(id: ModelAssetId, model: Object3D): void {
    if (!isSettlementModelId(id)) {
      return;
    }
    const meshes: Mesh[] = [];
    model.traverse((object) => {
      if (isMesh(object)) {
        meshes.push(object);
      }
    });
    for (const mesh of meshes) {
      this.dressMesh(mesh);
    }
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Fades the edge lines with the camera's zoom, in pixels per world
   * unit: `edgeOpacityFar` at or below the far zoom, `edgeOpacityNear`
   * at or above the near one, linear between.
   */
  setZoom(zoom: number): void {
    const { edgeFadeFarZoom, edgeFadeNearZoom, edgeOpacityFar, edgeOpacityNear } =
      this.tuning;
    const span = edgeFadeNearZoom - edgeFadeFarZoom;
    const unit =
      span > 0
        ? Math.min(1, Math.max(0, (zoom - edgeFadeFarZoom) / span))
        : 1;
    this.edgeMaterial.opacity =
      edgeOpacityFar + (edgeOpacityNear - edgeOpacityFar) * unit;
  }

  /** Current edge opacity, for tests. */
  edgeOpacity(): number {
    return this.edgeMaterial.opacity;
  }

  /**
   * Ticks the edge fade from a zoom source every frame, for the scene
   * service's updatable list.
   *
   * @param zoom - Reads the camera's current zoom.
   */
  followZoom(zoom: () => number): FrameUpdatable {
    return { update: () => this.setZoom(zoom()) };
  }

  /** Releases the shared materials and every edge geometry it built. */
  dispose(): void {
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
    this.edgeMaterial.dispose();
    for (const geometry of this.edgeGeometries) {
      geometry.dispose();
    }
    this.edgeGeometries.length = 0;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Swaps one mesh's material(s) for the class material and, for a body, adds its edges. */
  private dressMesh(mesh: Mesh): void {
    const authored = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const classes = authored.map((material) => classify(material.name));
    for (const material of authored) {
      material.dispose();
    }
    const replaced = classes.map((kind) => this.materials[kind]);
    mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0]!;
    if (classes.every((kind) => kind === "body")) {
      const edges = new EdgesGeometry(
        mesh.geometry,
        this.tuning.edgeThresholdDeg,
      );
      this.edgeGeometries.push(edges);
      const lines = new LineSegments(edges, this.edgeMaterial);
      lines.name = SETTLEMENT_EDGES_NAME;
      mesh.add(lines);
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** Narrows a scene object to a mesh without three's `any`-typed generics leaking out. */
function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

/** The display class for an authored material name. */
function classify(token: string): DisplayClass {
  if (token === WINDOW_TOKEN) {
    return "window";
  }
  if (token === BEACON_TOKEN) {
    return "beacon";
  }
  if (token === ACCENT_TOKEN) {
    return "accent";
  }
  if (FOLIAGE_TOKENS.has(token)) {
    return "foliage";
  }
  return "body";
}

/** Names a material and returns it, so the constructor reads as a table. */
function named<T extends Material>(material: T, name: string): T {
  material.name = name;
  return material;
}
