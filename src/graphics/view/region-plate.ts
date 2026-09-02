import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from "three";

import type { BiomeId } from "../../content/model/biome-id";
import type { Region, RegionId } from "../../overworld/model/region";
import type { Disposable } from "../model/disposable";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import type { PlateExtent } from "../service/overworld-layout";

// ===========================================
// Palette
// ===========================================

/** Plate colour per biome: the style guide's ground colour for that climate (§4.3). */
export const BIOME_PLATE_COLOUR: Readonly<Record<BiomeId, number>> = {
  temperate: 0x5e7a3a, // env-grass
  snowy: 0xe8ecf0, // env-snow
  desert: 0xd9b87a, // env-sand
  coastal: 0xb5a276, // env-wet-sand
};

/** Plate outline and label placeholder: `ui-text-dim`. */
const OUTLINE_COLOUR = 0x8b94a6;

/** Label placeholder bar size, in world units. */
const LABEL_BAR = { maxWidth: 1.6, height: 0.04, depth: 0.3 };

/** Plates draw first among transparent objects so marker sprites sit on top of them. */
const PLATE_RENDER_ORDER = 1;

// ===========================================
// Plate
// ===========================================

/**
 * One region: a translucent slab tinted by biome so the Earth texture
 * shows through, an outline, and a small bar where the label will go.
 * The tint reads as "this region's climate" over whatever the map
 * beneath it looks like, textured or flat (architecture §7).
 *
 * ```
 *     ┌──────────────────┐ ◀ outline (EdgesGeometry)
 *     │      ▬▬▬▬        │ ◀ label placeholder at region.layout
 *     │ ░░·░░░░░░░░·░░░░ │   translucent biome tint over the map
 *     └──────────────────┘   (city markers are separate objects)
 * ```
 */
export class RegionPlate {
  // ===========================================
  // Fields
  // ===========================================

  readonly regionId: RegionId;
  /** Add this to the scene; it carries the slab, outline and label bar. */
  readonly object: Group;
  private readonly disposables: Disposable[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param region - Region to represent; its biome picks the colour.
   * @param extent - Where the plate sits and how big it is.
   * @param config - Plate thickness.
   */
  constructor(
    region: Region,
    extent: PlateExtent,
    config: OverworldSceneConfig,
  ) {
    this.regionId = region.id;
    this.object = new Group();
    this.object.name = `region-${region.id}`;
    this.object.position.set(extent.centre.x, 0, extent.centre.z);

    const slabGeometry = new BoxGeometry(
      extent.width,
      config.plateHeight,
      extent.depth,
    );
    const slabMaterial = new MeshStandardMaterial({
      color: BIOME_PLATE_COLOUR[region.biome],
      flatShading: true,
      metalness: 0,
      roughness: 0.9,
      transparent: true,
      opacity: config.plateOpacity,
      depthWrite: false,
    });
    slabMaterial.name = `biome-${region.biome}`;
    const slab = new Mesh(slabGeometry, slabMaterial);
    slab.name = `region-slab-${region.id}`;
    slab.renderOrder = PLATE_RENDER_ORDER;
    slab.position.y = config.plateHeight / 2;
    this.object.add(slab);

    const outlineGeometry = new EdgesGeometry(slabGeometry);
    const outlineMaterial = new LineBasicMaterial({ color: OUTLINE_COLOUR });
    const outline = new LineSegments(outlineGeometry, outlineMaterial);
    outline.name = `region-outline-${region.id}`;
    outline.position.y = config.plateHeight / 2;
    this.object.add(outline);

    const labelGeometry = new BoxGeometry(
      Math.min(LABEL_BAR.maxWidth, extent.width * 0.5),
      LABEL_BAR.height,
      LABEL_BAR.depth,
    );
    const labelMaterial = new MeshStandardMaterial({
      color: OUTLINE_COLOUR,
      flatShading: true,
    });
    const label = new Mesh(labelGeometry, labelMaterial);
    label.name = `region-label-${region.id}`;
    label.position.y = config.plateHeight + LABEL_BAR.height / 2;
    this.object.add(label);

    this.disposables.push(
      slabGeometry,
      slabMaterial,
      outlineGeometry,
      outlineMaterial,
      labelGeometry,
      labelMaterial,
    );
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Releases every geometry and material the plate created. */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}
