import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Disposable } from "../model/disposable";
import { tileTopCentre } from "./tactical-map-view";

// ===========================================
// Constants
// ===========================================

/** Colour of a radar's location blips: the red every enemy mark wears. */
export const RADAR_BLIP_COLOUR = 0xe0453c;

/** Colour of an objective's location blip (#1173): white, so it never reads as an enemy. */
export const OBJECTIVE_BLIP_COLOUR = 0xffffff;

/**
 * Colour of a seismic sensor's mark on a burrowed bug's column (campaign
 * arc §10.2): amber, the colour of disturbed earth, so "under the ground,
 * here" never reads as the red of an enemy standing there.
 */
export const SEISMIC_BLIP_COLOUR = 0xf0a030;

/** Draw order of every blip: above fog, roofs and the marks painted on the map. */
export const BLIP_RENDER_ORDER = 20;

/** How far above the tile top a blip floats, so it clears the ground it is painted on. */
const BLIP_LIFT = 0.12;

// ===========================================
// Types
// ===========================================

/**
 * The halo a blip wears around its dot. A round halo means a unit; a
 * four-segment ring, drawn as a diamond on screen, means a fixed
 * structure; a round halo inside a second, wider ring — a ripple
 * spreading out from the column — means something under the ground.
 */
export type BlipShape = "round" | "diamond" | "ripple";

// ===========================================
// Intel blip painter
// ===========================================

/**
 * Draws location-only intel marks in one colour: a dot with a halo, flat
 * on the tile, depth-tested off so it shows through fog, walls and roofs.
 * The radar view paints its contacts red with one of these and the
 * objective marker view paints the mission's nests white with another
 * (#1173), so the two blips are the same mark in different colours.
 *
 * ```
 *   round     ◉    a unit somewhere on that tile
 *   diamond   ◈    a structure standing on it
 *   ripple   (◉)   something under the ground at that column
 * ```
 *
 * Owns the geometry and the material it hands out; the meshes it makes
 * share them, so disposing the painter frees every blip drawn with it.
 */
export class IntelBlipPainter implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly dot = new CircleGeometry(0.16, 20);
  private readonly roundHalo = new RingGeometry(0.25, 0.31, 24);
  /**
   * Four segments turned an eighth: with its edges along the world axes
   * the ring projects as a diamond under the isometric camera, where a
   * ring with its corners on the axes came out as a flat screen box.
   */
  private readonly diamondHalo = new RingGeometry(0.3, 0.41, 4, 1, Math.PI / 4);
  /** The ripple's outer ring: thin and wide, the tremor spreading from the column. */
  private readonly rippleRing = new RingGeometry(0.4, 0.45, 32);
  private readonly material: MeshBasicMaterial;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Prepares one colour of blip.
   *
   * @param colour - The colour every blip from this painter wears.
   */
  constructor(colour: number) {
    this.material = new MeshBasicMaterial({
      color: colour,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * One blip, positioned over `pos` and ready to be added to a layer.
   *
   * @param pos - The tile the intel points at.
   * @param shape - Round for a unit, diamond for a structure, ripple for
   *   something under the ground.
   * @param name - Scene-graph name, for tests and inspection.
   * @returns The blip's group: a dot and its halo (two rings for a
   *   ripple) lying flat on the tile.
   */
  paint(pos: TileCoord, shape: BlipShape, name: string): Group {
    const blip = new Group();
    blip.name = name;
    const at = tileTopCentre(pos);
    blip.position.set(at.x, at.y + BLIP_LIFT, at.z);
    for (const geometry of this.geometriesOf(shape)) {
      const mark = new Mesh(geometry, this.material);
      mark.rotation.x = -Math.PI / 2;
      mark.renderOrder = BLIP_RENDER_ORDER;
      blip.add(mark);
    }
    return blip;
  }

  /** Frees the geometry and material every blip painted here shares. */
  dispose(): void {
    this.dot.dispose();
    this.roundHalo.dispose();
    this.diamondHalo.dispose();
    this.rippleRing.dispose();
    this.material.dispose();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * The flat pieces one shape of blip is made of, dot first.
   *
   * @param shape - The blip's shape.
   * @returns The shared geometries to lay on the tile.
   */
  private geometriesOf(
    shape: BlipShape,
  ): readonly (CircleGeometry | RingGeometry)[] {
    switch (shape) {
      case "diamond":
        return [this.dot, this.diamondHalo];
      case "ripple":
        return [this.dot, this.roundHalo, this.rippleRing];
      case "round":
        return [this.dot, this.roundHalo];
    }
  }
}
