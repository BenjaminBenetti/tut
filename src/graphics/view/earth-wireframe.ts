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
import type {
  GroundPoint,
  GroundPolygon,
  GroundRing,
} from "../service/coastline-projection";

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
 * `ui-info` to white, and the coast should stay the token.
 */
const GLOW_OPACITY = 0.45;

/**
 * Ground-plane offset of the glow passes, in world units. WebGL draws a
 * line one pixel wide on every platform, so the glow is the same line
 * drawn again slightly to each side: under a pixel at the widest zoom,
 * where it only softens the core's edge, and a two-pixel halo at the
 * tightest.
 */
const GLOW_OFFSET = 0.012;

/** The four directions the glow passes are offset in. */
const GLOW_DIRECTIONS: readonly GroundPoint[] = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

/**
 * Heights above the slab top, all under the region wash (which floats
 * above `plateHeight`) and far enough apart not to z-fight: fill, then
 * the graticule, then the coastline on top.
 */
const FILL_LIFT = 0.01;
const GRATICULE_LIFT = 0.02;
const COASTLINE_LIFT = 0.03;

/** Fill draws first among transparent objects, under the region washes. */
const FILL_RENDER_ORDER = 0;

/** How close to the map's edge a coordinate must be to count as on it. */
const BORDER_EPSILON = 1e-6;

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
 *     │ ░░ region wash (plateHeight + lift)
 *     │ ── coastline + glow       COASTLINE_LIFT
 *     │ ┼┼ graticule + axes       GRATICULE_LIFT
 *     │ ▒▒ land fill              FILL_LIFT
 *   0 ┼──── slab top, ui-bg
 * ```
 *
 * Everything is built from rings already on the ground plane, so the
 * mapping from a coordinate to a pixel is the one the city markers use.
 * Segments that lie along the map's border (Antarctica's edge at −90°,
 * the antimeridian) are not drawn: they are the edge of the plane, not
 * a coast.
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
    this.object.add(this.createLandFill(polygons));
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
   * A translucent fill of every land mass, triangulated from its rings
   * with the inland seas cut out, lying flat on the ground plane.
   */
  private createLandFill(polygons: readonly GroundPolygon[]): Mesh {
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
    material.name = "earth-land-fill";
    const mesh = new Mesh(geometry, material);
    mesh.name = "earth-land";
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
    for (const polygon of polygons) {
      pushRing(positions, polygon.outer, config);
      for (const hole of polygon.holes) {
        pushRing(positions, hole, config);
      }
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

/** Appends every edge of a ring that is not part of the map's border. */
function pushRing(
  positions: number[],
  ring: GroundRing,
  config: OverworldSceneConfig,
): void {
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    if (a && b && !isBorderSegment(a, b, config)) {
      pushSegment(positions, a, b);
    }
  }
}

/**
 * True when both ends of a segment lie on the same edge of the map
 * plane: the antimeridian on either side, the poles top and bottom.
 * Natural Earth closes Antarctica along −90° and the antimeridian, and
 * those edges drawn would be a line across the whole bottom of the map.
 */
function isBorderSegment(
  a: GroundPoint,
  b: GroundPoint,
  config: OverworldSceneConfig,
): boolean {
  const onEdge = (value: number, edge: number): boolean =>
    Math.abs(value - edge) <= BORDER_EPSILON;
  return (
    (onEdge(a.x, 0) && onEdge(b.x, 0)) ||
    (onEdge(a.x, config.mapWidth) && onEdge(b.x, config.mapWidth)) ||
    (onEdge(a.z, 0) && onEdge(b.z, 0)) ||
    (onEdge(a.z, config.mapDepth) && onEdge(b.z, config.mapDepth))
  );
}
