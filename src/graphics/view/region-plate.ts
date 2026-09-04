import type { Texture } from "three";
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";

import type { Region, RegionId } from "../../overworld/model/region";
import type { Disposable } from "../model/disposable";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import type { PlateExtent } from "../service/overworld-layout";
// The wash must match the ring the marker draws, so the accent comes
// from the marker rather than being repeated here.
import { SELECTION_COLOUR } from "./city-marker";
import { infestationColour, infestationFraction } from "./infestation-ramp";

// ===========================================
// Constants
// ===========================================

/** Plates draw first among transparent objects so marker sprites sit on top of them. */
const PLATE_RENDER_ORDER = 1;

/**
 * How far above the map surface the wash floats. The plates it replaced
 * were boxes whose *top face* sat at ground level; a flat quad has to be
 * lifted or the slab hides it. Small enough that the straight-down
 * camera shows no parallax, large enough not to z-fight.
 */
const WASH_LIFT = 0.01;

/**
 * Opacity a selected region's wash never falls below, so clicking a city
 * in a clean region still shows you which cities belong to it.
 */
const SELECTED_FLOOR = 0.5;

// ===========================================
// Plate
// ===========================================

/**
 * One region, drawn as a **wash of its infestation colour** over the
 * Earth texture: no border, and no fill at all while the region is
 * clean.
 *
 * ```
 *   clean region          infested region       selected region
 *   (nothing drawn)       soft wash on the      the selection accent,
 *                         infestation ramp      at least SELECTED_FLOOR
 * ```
 *
 * It used to be a biome-tinted slab with an `EdgesGeometry` outline.
 * Under the tilted camera that read as ground; straight down (#420) a
 * dozen bounding boxes with visible borders read as a debug overlay,
 * their edges cutting across coastlines that have nothing to do with the
 * region (#440). A region is a grouping of cities, so its bounding box
 * will never line up with anything the player recognises — the fix is to
 * stop drawing the box and draw only what the box is *for*.
 *
 * The biome tint went with it: the Earth texture already shows the
 * terrain, and tinting it by climate only muddied the one signal that
 * has to survive a glance (GDD §5.3). Infestation now owns the wash, on
 * the same ramp the city markers use, so a region and the cities inside
 * it always agree.
 */
export class RegionPlate {
  // ===========================================
  // Fields
  // ===========================================

  readonly regionId: RegionId;
  /** Add this to the scene; it carries the wash. */
  readonly object: Group;
  private readonly material: MeshStandardMaterial;
  private readonly maxOpacity: number;
  private readonly disposables: Disposable[] = [];
  private infestation = 0;
  private selected = false;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param region - Region to represent.
   * @param extent - Where the wash sits and how big it is.
   * @param config - Plate height and the wash's opacity at full infestation.
   * @param falloff - Radial alpha map shared by every plate, so the wash
   *   fades out instead of ending at a border. The caller owns it.
   */
  constructor(
    region: Region,
    extent: PlateExtent,
    config: OverworldSceneConfig,
    falloff: Texture,
  ) {
    this.regionId = region.id;
    this.maxOpacity = config.plateOpacity;
    this.object = new Group();
    this.object.name = `region-${region.id}`;
    this.object.position.set(extent.centre.x, 0, extent.centre.z);

    // A ground-plane quad, not a box: seen straight down a box shows
    // only its top face anyway, and its sides lit differently were part
    // of what made plates read as objects sitting on the map (#440).
    const geometry = new PlaneGeometry(extent.width, extent.depth);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshStandardMaterial({
      color: infestationColour(0),
      flatShading: true,
      metalness: 0,
      roughness: 0.9,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      alphaMap: falloff,
    });
    this.material.name = `region-wash-${region.id}`;
    const wash = new Mesh(geometry, this.material);
    wash.name = `region-slab-${region.id}`;
    wash.renderOrder = PLATE_RENDER_ORDER;
    wash.position.y = config.plateHeight + WASH_LIFT;
    this.object.add(wash);

    this.disposables.push(geometry, this.material);
    this.refresh();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Sets how infested the region is, which picks both the wash colour
   * and how strongly it shows.
   *
   * @param infestation - The region's infestation, normally `0–100`.
   */
  setInfestation(infestation: number): void {
    this.infestation = infestation;
    this.refresh();
  }

  /**
   * Marks the region as the selected city's, which keeps its wash
   * visible even when the region is clean.
   *
   * @param selected - Whether one of its cities is selected.
   */
  setSelected(selected: boolean): void {
    this.selected = selected;
    this.refresh();
  }

  /** What the wash currently shows: its colour and how strongly it draws. */
  look(): { readonly colour: number; readonly opacity: number } {
    return {
      colour: this.material.color.getHex(),
      opacity: this.material.opacity,
    };
  }

  /** Releases every geometry and material the plate created. */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Repaints the wash from infestation and selection. Opacity rises with
   * infestation from nothing at all, so a clean map draws no regions and
   * an overrun one glows; a selected region never drops below
   * `SELECTED_FLOOR`.
   */
  private refresh(): void {
    const fraction = infestationFraction(this.infestation);
    const wash = fraction * this.maxOpacity;
    const opacity = this.selected ? Math.max(wash, SELECTED_FLOOR) : wash;
    // Selected regions wear the selection accent, not their infestation
    // colour: a clean region is green on green land and cannot be seen,
    // and the accent is already what "you picked this" looks like on the
    // marker. Only one region is selected at a time, and the panel gives
    // that region's infestation as a number besides.
    this.material.color.setHex(
      this.selected ? SELECTION_COLOUR : infestationColour(this.infestation),
    );
    this.material.opacity = opacity;
    this.material.visible = opacity > 0;
  }
}
