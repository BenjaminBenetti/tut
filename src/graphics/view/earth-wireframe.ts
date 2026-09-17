import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
} from "three";

import type { Disposable } from "../model/disposable";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { partitionClaimableLand } from "../service/claimable-land";
import type {
  GroundPoint,
  GroundPolygon,
} from "../service/coastline-projection";
import { coastlineSegments } from "../service/coastline-segments";

// ===========================================
// Constants
// ===========================================

/** Coastline colour: `ui-info`, the intel tone, distinct from the orange markers and the infestation ramp. */
export const COASTLINE_COLOUR = 0x7fd1ff;

/** Graticule colour: `ui-line`, the token for grid lines. */
export const GRATICULE_COLOUR = 0x2e3646;

/** Equator and prime meridian: `ui-text-dim`, so the two reference lines read over the grid without competing with the coast. */
export const AXIS_COLOUR = 0x8b94a6;

/** Graticule spacing in degrees of longitude and latitude. */
export const GRATICULE_STEP_DEG = 30;

/** How strongly land is filled behind its coastline; the ground always shows through. */
const LAND_FILL_OPACITY = 0.1;

/**
 * Opacity of each of the four offset glow passes behind the coastline.
 * They blend normally rather than additively: additive passes that land
 * on the core's own pixel, which they all do at the widest zoom, push
 * `ui-info` to white, and the coast should stay the token. The selected
 * region's outline glows the same way (#1149).
 */
export const GLOW_OPACITY = 0.45;

/**
 * Ground-plane offset of the glow passes, in world units. WebGL draws a
 * line one pixel wide on every platform, so the glow is the same line
 * drawn again slightly to each side: under a pixel at the widest zoom,
 * where it only softens the core's edge, and a two-pixel halo at the
 * tightest.
 */
export const GLOW_OFFSET = 0.012;

/** The four directions the glow passes are offset in. */
export const GLOW_DIRECTIONS: readonly GroundPoint[] = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

/**
 * Heights above the slab top, all under the markers (which stand at
 * `markerLift`) and far enough apart not to z-fight: fill, then the
 * graticule, then the coastline on top. The region territories (#1149)
 * slot their fill and borders between these; see `region-territories`.
 */
const FILL_LIFT = 0.01;
const GRATICULE_LIFT = 0.02;
const COASTLINE_LIFT = 0.03;

/**
 * Fill draws first among transparent objects, so the region
 * territories (#1149) blend over it rather than under it.
 */
export const FILL_RENDER_ORDER = 0;

// ===========================================
// Wireframe
// ===========================================

/**
 * The strategic map's Earth, drawn as vector lines in the manner of the
 * WarGames NORAD board (#1144): glowing coastlines over a dim 30°
 * graticule on a near-black ground, with a faint land fill so the
 * continents read as shapes. Unlit throughout, so the palette tokens
 * land on screen exactly.
 *
 * ```
 *   y ▲
 *     │ ●  city markers            markerLift
 *     │ ── coastline + glow        COASTLINE_LIFT
 *     │ ┼┼ graticule + axes        GRATICULE_LIFT
 *     │ ▒▒ land fill               FILL_LIFT
 *   0 ┼──── slab top, ui-bg
 * ```
 *
 * Everything is built from rings already on the ground plane, so the
 * mapping from a coordinate to a pixel is the one the city markers use.
 * Segments that lie along the map's border (Antarctica's edge at −90°,
 * the antimeridian) are not drawn: they are the edge of the plane, not
 * a coast.
 *
 * The land fill is drawn as two meshes, the claimable land and the
 * polar land no region reaches, so either can be asked for on its own;
 * they look the same. The region territories (#1149) are cut to the
 * claimable land on the CPU rather than clipped against this fill.
 */
export class EarthWireframe {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; it carries every line and the fill. */
  readonly object: Group;
  private readonly disposables: Disposable[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param polygons - Land masses on the ground plane, in world units.
   * @param config - Map plane size, for the graticule and the border.
   */
  constructor(
    polygons: readonly GroundPolygon[],
    config: OverworldSceneConfig,
  ) {
    this.object = new Group();
    this.object.name = "earth-wireframe";
    const land = partitionClaimableLand(polygons, config);
    this.object.add(this.createLandFill(land.claimable, "earth-land"));
    this.object.add(
      this.createLandFill(land.unclaimed, "earth-land-unclaimed"),
    );
    this.object.add(...this.createGraticule(config));
    this.object.add(...this.createCoastlines(polygons, config));
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Releases every geometry and material the wireframe created. */
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
   * A translucent fill of the given land masses, triangulated from
   * their rings with the inland seas cut out, lying flat on the ground
   * plane.
   *
   * @param polygons - The land masses to fill.
   * @param name - Name of the mesh; its material is `${name}-fill`.
   */
  private createLandFill(
    polygons: readonly GroundPolygon[],
    name: string,
  ): Mesh {
    const shapes = polygons.map((polygon) => {
      const shape = new Shape(polygon.outer.map(toShapePoint));
      for (const hole of polygon.holes) {
        shape.holes.push(new Path(hole.map(toShapePoint)));
      }
      return shape;
    });
    const geometry = new ShapeGeometry(shapes);
    // Shapes are authored in the XY plane; lay them on XZ with the
    // shape's y running along +z (south), which `toShapePoint` negated.
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      color: COASTLINE_COLOUR,
      transparent: true,
      opacity: LAND_FILL_OPACITY,
      depthWrite: false,
    });
    material.name = `${name}-fill`;
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = FILL_LIFT;
    mesh.renderOrder = FILL_RENDER_ORDER;
    this.disposables.push(geometry, material);
    return mesh;
  }

  /**
   * Lines of longitude and latitude every `GRATICULE_STEP_DEG`, the
   * map's border included, in the grid tone; the equator and the prime
   * meridian in the brighter axis tone.
   */
  private createGraticule(config: OverworldSceneConfig): LineSegments[] {
    const grid: number[] = [];
    const axes: number[] = [];
    for (let lon = -180; lon <= 180; lon += GRATICULE_STEP_DEG) {
      const x = ((lon + 180) / 360) * config.mapWidth;
      pushSegment(
        lon === 0 ? axes : grid,
        { x, z: 0 },
        { x, z: config.mapDepth },
      );
    }
    for (let lat = -90; lat <= 90; lat += GRATICULE_STEP_DEG) {
      const z = ((90 - lat) / 180) * config.mapDepth;
      pushSegment(
        lat === 0 ? axes : grid,
        { x: 0, z },
        { x: config.mapWidth, z },
      );
    }
    return [
      this.createLines(
        "earth-graticule",
        grid,
        GRATICULE_COLOUR,
        GRATICULE_LIFT,
      ),
      this.createLines("earth-axes", axes, AXIS_COLOUR, GRATICULE_LIFT),
    ];
  }

  /**
   * Every coastline edge as one `LineSegments`, plus four additive
   * copies of it offset across the ground plane for the glow. All five
   * share one geometry.
   */
  private createCoastlines(
    polygons: readonly GroundPolygon[],
    config: OverworldSceneConfig,
  ): LineSegments[] {
    const positions: number[] = [];
    for (const segment of coastlineSegments(polygons, config)) {
      pushSegment(positions, segment.a, segment.b);
    }
    const core = this.createLines(
      "earth-coastlines",
      positions,
      COASTLINE_COLOUR,
      COASTLINE_LIFT,
    );
    const glowMaterial = new LineBasicMaterial({
      color: COASTLINE_COLOUR,
      transparent: true,
      opacity: GLOW_OPACITY,
      depthWrite: false,
    });
    glowMaterial.name = "earth-coastline-glow";
    this.disposables.push(glowMaterial);
    const glows = GLOW_DIRECTIONS.map((direction, index) => {
      const glow = new LineSegments(core.geometry, glowMaterial);
      glow.name = `earth-coastline-glow-${String(index)}`;
      glow.position.set(
        direction.x * GLOW_OFFSET,
        COASTLINE_LIFT,
        direction.z * GLOW_OFFSET,
      );
      return glow;
    });
    return [core, ...glows];
  }

  /** One unlit `LineSegments` from a flat `[x, y, z, …]` list, lifted above the slab. */
  private createLines(
    name: string,
    positions: readonly number[],
    colour: number,
    lift: number,
  ): LineSegments {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([...positions], 3),
    );
    const material = new LineBasicMaterial({ color: colour });
    material.name = name;
    const lines = new LineSegments(geometry, material);
    lines.name = name;
    lines.position.y = lift;
    this.disposables.push(geometry, material);
    return lines;
  }
}

// ===========================================
// Helpers
// ===========================================

/** A ground point as the plane vector `Shape` takes; `z` is negated because `rotateX(-π/2)` maps shape `y` onto world `−z`. */
function toShapePoint(point: GroundPoint): Vector2 {
  return new Vector2(point.x, -point.z);
}

/** Appends one segment to a flat position list. */
function pushSegment(
  positions: number[],
  a: GroundPoint,
  b: GroundPoint,
): void {
  positions.push(a.x, 0, a.z, b.x, 0, b.z);
}
