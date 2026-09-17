import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";

import type { RegionId } from "../../overworld/model/region";
import type { Disposable } from "../model/disposable";
import type {
  GroundPoint,
  GroundPolygon,
} from "../service/coastline-projection";
import type { GroundSegment } from "../service/coastline-segments";
import {
  clipLandToConvex,
  clipSegmentToLand,
  triangulateLand,
} from "../service/land-clipping";
import type {
  RegionBorder,
  TerritoryCell,
} from "../service/region-territory-service";
import { cellAt, regionBorders } from "../service/region-territory-service";
// The outline must match the ring the marker draws, so the accent comes
// from the marker rather than being repeated here.
import { SELECTION_COLOUR } from "./city-marker";
import {
  AXIS_COLOUR,
  GLOW_DIRECTIONS,
  GLOW_OFFSET,
  GLOW_OPACITY,
} from "./earth-wireframe";
import { infestationColour, infestationFraction } from "./infestation-ramp";

// ===========================================
// Types
// ===========================================

/** What the territories are built from. */
export interface RegionTerritoriesInput {
  /** The Voronoi partition of the map by city, tagged with regions. */
  readonly cells: readonly TerritoryCell[];
  /**
   * The land regions may claim, on the ground plane. Every fill and
   * border is cut to it on the CPU, so nothing is ever drawn over
   * ocean and the GPU is handed plain triangles.
   */
  readonly land: readonly GroundPolygon[];
  /**
   * Coastline edges of that land. Each is added to the outline of the
   * region whose cell it falls in, so a selected region lights up its
   * whole shoreline and not only its inland borders.
   */
  readonly coast: readonly GroundSegment[];
}

/** What a region's fill currently shows. */
export interface TerritoryFillLook {
  readonly colour: number;
  readonly opacity: number;
}

// ===========================================
// Constants
// ===========================================

/** Border colour: `ui-text-dim`, a step above the graticule and well under the coast. */
export const BORDER_COLOUR = AXIS_COLOUR;

/** How strongly the dim borders draw; the coastline stays the loudest line. */
export const BORDER_OPACITY = 0.35;

/** Fill opacity of a region whose worst city is fully overrun. */
export const FILL_MAX_OPACITY = 0.5;

/** Opacity of the accent outline on the region under the pointer; the selection draws at 1 with a glow. */
export const HOVER_OPACITY = 0.45;

/**
 * Heights above the slab top, slotted between the wireframe's own:
 * the fill just above the land fill (0.01) and under the graticule
 * (0.02), the borders between the graticule and the coastline (0.03),
 * and the selected outline above the coastline so it reads on top of
 * everything but the markers.
 */
const FILL_LIFT = 0.015;
const BORDER_LIFT = 0.025;
const SELECTION_LIFT = 0.035;

/**
 * Draw order among transparent objects: after the land fill (0) so the
 * fill blends over it, and before the marker sprites (2).
 */
const TERRITORY_RENDER_ORDER = 1;

// ===========================================
// Territories
// ===========================================

/**
 * The regions of the strategic map as territories on the wireframe
 * Earth (#1149): each region's land outlined by dim border lines,
 * filled on the infestation ramp as its worst city worsens, its
 * outline lit dimly in the accent while the pointer is over it and
 * fully, with a glow, when it is selected.
 *
 * ```
 *   clean region          infested region        selected region
 *   dim borders only      borders + ramp fill    borders + accent
 *                         at 0…FILL_MAX_OPACITY  outline with glow
 * ```
 *
 * Every fill and border is cut to the land on the CPU: the land is
 * triangulated once and each region's cells clip those triangles, so
 * a region's fill is one geometry of non-overlapping triangles that
 * ends exactly at the coast. Nothing here depends on the stencil or
 * on what was drawn before it, so the fill is the same flat wash on
 * every GPU.
 */
export class RegionTerritories {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; it carries the fills, borders and outlines. */
  readonly object: Group;
  private readonly fills = new Map<RegionId, MeshBasicMaterial>();
  /** Each region's outline where it meets other regions, cut to land. */
  private readonly borderOutlines = new Map<RegionId, BufferGeometry>();
  /** Each region's outline where it meets the sea: the coast, on land by definition. */
  private readonly coastOutlines = new Map<RegionId, BufferGeometry>();
  /** The selected region's border outline and its glow passes; their geometry is swapped on selection. */
  private readonly borderLines: LineSegments[] = [];
  /** The selected region's coast outline and its glow passes, likewise. */
  private readonly coastLines: LineSegments[] = [];
  /** The hovered region's border outline, dimmer than the selection and without glow. */
  private readonly hoverBorder: LineSegments;
  /** The hovered region's coast outline, likewise. */
  private readonly hoverCoast: LineSegments;
  /** An empty geometry the outlines show while nothing is selected. */
  private readonly noOutline = new BufferGeometry();
  private readonly disposables: Disposable[] = [];
  private selected: RegionId | undefined;
  private hovered: RegionId | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param input - The partition, the land and the coast to build from.
   */
  constructor(input: RegionTerritoriesInput) {
    this.object = new Group();
    this.object.name = "region-territories";
    this.disposables.push(this.noOutline);
    this.object.add(...this.createFills(input.cells, input.land));
    const borders = regionBorders(input.cells).flatMap((border) =>
      clipSegmentToLand(border, input.land).map((piece): RegionBorder => ({
        ...piece,
        regionIds: border.regionIds,
      })),
    );
    this.object.add(this.createBorders(borders));
    this.createOutlines(input, borders);
    this.hoverBorder = this.createHover("territory-hover");
    this.hoverCoast = this.createHover("territory-hover-coast");
    this.object.add(
      this.hoverBorder,
      this.hoverCoast,
      ...this.createSelection("territory-selection", this.borderLines),
      ...this.createSelection("territory-selection-coast", this.coastLines),
    );
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Sets how infested a region is, which picks its fill colour on the
   * ramp and how strongly the fill draws: nothing at all when clean,
   * `FILL_MAX_OPACITY` when overrun.
   *
   * @param regionId - The region.
   * @param infestation - Its worst city's infestation, normally `0–100`.
   */
  setInfestation(regionId: RegionId, infestation: number): void {
    const material = this.fills.get(regionId);
    if (!material) {
      return;
    }
    const opacity = infestationFraction(infestation) * FILL_MAX_OPACITY;
    material.color.setHex(infestationColour(infestation));
    material.opacity = opacity;
    material.visible = opacity > 0;
  }

  /**
   * Lights one region's outline in the selection accent, or none. The
   * fill is left to infestation: selection is an outline, not a wash.
   *
   * @param regionId - The selected region, or `undefined`.
   */
  setSelected(regionId: RegionId | undefined): void {
    this.selected = regionId;
    this.showOutline(this.borderLines, regionId, this.borderOutlines);
    this.showOutline(this.coastLines, regionId, this.coastOutlines);
    this.applyHover();
  }

  /**
   * Outlines the region under the pointer dimly in the accent, or
   * none. The selected region shows its selection instead, so hovering
   * it changes nothing.
   *
   * @param regionId - The hovered region, or `undefined`.
   */
  setHovered(regionId: RegionId | undefined): void {
    this.hovered = regionId;
    this.applyHover();
  }

  /** The region whose outline is lit, if any. */
  selectedRegion(): RegionId | undefined {
    return this.selected;
  }

  /** The region whose outline is dimly lit under the pointer, if any. */
  hoveredRegion(): RegionId | undefined {
    return this.hovered;
  }

  /** What a region's fill shows, or `undefined` for an unknown region. */
  fillLook(regionId: RegionId): TerritoryFillLook | undefined {
    const material = this.fills.get(regionId);
    return material
      ? { colour: material.color.getHex(), opacity: material.opacity }
      : undefined;
  }

  /** How many segments a region's outline has, borders and coast together; `0` for an unknown region. */
  outlineSegmentCount(regionId: RegionId): number {
    return (
      segmentCount(this.borderOutlines.get(regionId)) +
      segmentCount(this.coastOutlines.get(regionId))
    );
  }

  /** Releases every geometry and material the territories created. */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.fills.clear();
    this.borderOutlines.clear();
    this.coastOutlines.clear();
    this.borderLines.length = 0;
    this.coastLines.length = 0;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * One fill mesh per region: the land triangles clipped to each of
   * the region's cells, fanned into one geometry, so the fill covers
   * exactly the region's land, once. Starts invisible; `setInfestation`
   * shows it. A region with no land still gets an empty fill so its
   * look can be asked for.
   */
  private createFills(
    cells: readonly TerritoryCell[],
    land: readonly GroundPolygon[],
  ): Mesh[] {
    const triangles = triangulateLand(land);
    const positions = new Map<RegionId, number[]>();
    for (const cell of cells) {
      const list = positions.get(cell.regionId) ?? [];
      positions.set(cell.regionId, list);
      for (const piece of clipLandToConvex(triangles, cell.vertices)) {
        pushFan(list, piece);
      }
    }
    return [...positions].map(([regionId, list]) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(list, 3));
      const material = new MeshBasicMaterial({
        color: infestationColour(0),
        transparent: true,
        opacity: 0,
        visible: false,
        depthWrite: false,
        side: DoubleSide,
      });
      material.name = `territory-fill-${regionId}`;
      const mesh = new Mesh(geometry, material);
      mesh.name = `territory-fill-${regionId}`;
      mesh.position.y = FILL_LIFT;
      mesh.renderOrder = TERRITORY_RENDER_ORDER;
      this.fills.set(regionId, material);
      this.disposables.push(geometry, material);
      return mesh;
    });
  }

  /** Every on-land region border piece once, as one dim `LineSegments`. */
  private createBorders(borders: readonly GroundSegment[]): LineSegments {
    const positions: number[] = [];
    for (const border of borders) {
      pushSegment(positions, border.a, border.b);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({
      color: BORDER_COLOUR,
      transparent: true,
      opacity: BORDER_OPACITY,
      depthWrite: false,
    });
    material.name = "territory-borders";
    const lines = new LineSegments(geometry, material);
    lines.name = "territory-borders";
    lines.position.y = BORDER_LIFT;
    lines.renderOrder = TERRITORY_RENDER_ORDER;
    this.disposables.push(geometry, material);
    return lines;
  }

  /**
   * Two outline geometries per region: its on-land borders with other
   * regions, and every coast segment whose midpoint falls in one of
   * its cells. Kept apart so a caller can tell, and test, which half
   * of an outline came from where; both are drawn the same way.
   */
  private createOutlines(
    input: RegionTerritoriesInput,
    borders: readonly RegionBorder[],
  ): void {
    const borderPositions = new Map<RegionId, number[]>();
    const coastPositions = new Map<RegionId, number[]>();
    const listFor = (
      positions: Map<RegionId, number[]>,
      regionId: RegionId,
    ): number[] => {
      const list = positions.get(regionId) ?? [];
      positions.set(regionId, list);
      return list;
    };
    for (const cell of input.cells) {
      listFor(borderPositions, cell.regionId);
      listFor(coastPositions, cell.regionId);
    }
    for (const border of borders) {
      for (const regionId of border.regionIds) {
        pushSegment(listFor(borderPositions, regionId), border.a, border.b);
      }
    }
    for (const segment of input.coast) {
      const midpoint = {
        x: (segment.a.x + segment.b.x) / 2,
        z: (segment.a.z + segment.b.z) / 2,
      };
      const cell = cellAt(midpoint, input.cells);
      if (cell) {
        pushSegment(
          listFor(coastPositions, cell.regionId),
          segment.a,
          segment.b,
        );
      }
    }
    const build = (
      positions: Map<RegionId, number[]>,
      outlines: Map<RegionId, BufferGeometry>,
    ): void => {
      for (const [regionId, list] of positions) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(list, 3));
        outlines.set(regionId, geometry);
        this.disposables.push(geometry);
      }
    };
    build(borderPositions, this.borderOutlines);
    build(coastPositions, this.coastOutlines);
  }

  /**
   * One half of the selected region's outline in the accent: a core
   * line plus the four offset glow passes the coastline uses, all
   * hidden until a region is selected. Transparent so they draw in the
   * transparent pass, over the fills.
   *
   * @param name - Name of the core line; the glow passes are `${name}-glow-N`.
   * @param into - Where the created lines are kept for `setSelected`.
   */
  private createSelection(name: string, into: LineSegments[]): LineSegments[] {
    const core = new LineBasicMaterial({
      color: SELECTION_COLOUR,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    core.name = name;
    const glow = new LineBasicMaterial({
      color: SELECTION_COLOUR,
      transparent: true,
      opacity: GLOW_OPACITY,
      depthWrite: false,
    });
    glow.name = `${name}-glow`;
    this.disposables.push(core, glow);
    const lines = new LineSegments(this.noOutline, core);
    lines.name = name;
    lines.position.y = SELECTION_LIFT;
    const passes = GLOW_DIRECTIONS.map((direction, index) => {
      const pass = new LineSegments(this.noOutline, glow);
      pass.name = `${name}-glow-${String(index)}`;
      pass.position.set(
        direction.x * GLOW_OFFSET,
        SELECTION_LIFT,
        direction.z * GLOW_OFFSET,
      );
      return pass;
    });
    into.push(lines, ...passes);
    for (const object of into) {
      object.renderOrder = TERRITORY_RENDER_ORDER;
      object.visible = false;
    }
    return into;
  }

  /**
   * One half of the hovered region's outline: a single dim accent line
   * with no glow, so hover reads as a hint and selection as the answer.
   *
   * @param name - Name of the line.
   */
  private createHover(name: string): LineSegments {
    const material = new LineBasicMaterial({
      color: SELECTION_COLOUR,
      transparent: true,
      opacity: HOVER_OPACITY,
      depthWrite: false,
    });
    material.name = name;
    this.disposables.push(material);
    const lines = new LineSegments(this.noOutline, material);
    lines.name = name;
    lines.position.y = SELECTION_LIFT;
    lines.renderOrder = TERRITORY_RENDER_ORDER;
    lines.visible = false;
    return lines;
  }

  /** Shows the hovered region's outline unless it is the selected one. */
  private applyHover(): void {
    const shown = this.hovered === this.selected ? undefined : this.hovered;
    this.showOutline([this.hoverBorder], shown, this.borderOutlines);
    this.showOutline([this.hoverCoast], shown, this.coastOutlines);
  }

  /** Points a set of outline lines at one region's geometry, or hides them. */
  private showOutline(
    lines: readonly LineSegments[],
    regionId: RegionId | undefined,
    outlines: ReadonlyMap<RegionId, BufferGeometry>,
  ): void {
    const outline = regionId === undefined ? undefined : outlines.get(regionId);
    for (const line of lines) {
      line.geometry = outline ?? this.noOutline;
      line.visible = outline !== undefined;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** Segments in a line geometry; `0` for none. */
function segmentCount(geometry: BufferGeometry | undefined): number {
  return geometry ? geometry.getAttribute("position").count / 2 : 0;
}

/** Appends one segment to a flat position list. */
function pushSegment(
  positions: number[],
  a: GroundPoint,
  b: GroundPoint,
): void {
  positions.push(a.x, 0, a.z, b.x, 0, b.z);
}

/** Appends a convex polygon to a flat position list as a triangle fan. */
function pushFan(positions: number[], polygon: readonly GroundPoint[]): void {
  const [first, ...rest] = polygon;
  if (!first) {
    return;
  }
  for (let i = 1; i < rest.length; i++) {
    const b = rest[i - 1];
    const c = rest[i];
    if (b && c) {
      positions.push(first.x, 0, first.z, b.x, 0, b.z, c.x, 0, c.z);
    }
  }
}
