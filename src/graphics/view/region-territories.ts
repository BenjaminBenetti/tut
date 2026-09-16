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
import type { GroundPoint } from "../service/coastline-projection";
import type { GroundSegment } from "../service/coastline-segments";
import { testLandStencil } from "../service/land-stencil";
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
   * Coastline edges of the land regions may claim. Each is added to the
   * outline of the region whose cell it falls in, so a selected region
   * lights up its whole shoreline and not only its inland borders.
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
export const FILL_MAX_OPACITY = 0.35;

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
 * Draw order among transparent objects: after the land fill (0), which
 * stamps the stencil these are clipped by, and before the marker
 * sprites (2).
 */
const TERRITORY_RENDER_ORDER = 1;

// ===========================================
// Territories
// ===========================================

/**
 * The regions of the strategic map as territories on the wireframe
 * Earth (#1149): each region's land outlined by dim border lines,
 * filled on the infestation ramp as its worst city worsens, and its
 * outline lit in the selection accent when one of its cities is
 * selected.
 *
 * ```
 *   clean region          infested region        selected region
 *   dim borders only      borders + ramp fill    borders + accent
 *                         at 0…FILL_MAX_OPACITY  outline with glow
 * ```
 *
 * Every mesh and line here is clipped to land by the stencil the land
 * fill writes, so nothing is ever drawn over ocean, and the cells that
 * make up one region's fill share one geometry, so two cells of the
 * same colour meet without a seam or doubled alpha.
 */
export class RegionTerritories {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; it carries the fills, borders and outline. */
  readonly object: Group;
  private readonly fills = new Map<RegionId, MeshBasicMaterial>();
  /** Each region's outline where it meets other regions: clipped to land when drawn. */
  private readonly borderOutlines = new Map<RegionId, BufferGeometry>();
  /** Each region's outline where it meets the sea: the coast, on land by definition. */
  private readonly coastOutlines = new Map<RegionId, BufferGeometry>();
  /** The core border outline and its glow passes; their geometry is swapped on selection. */
  private readonly borderLines: LineSegments[] = [];
  /** The core coast outline and its glow passes, likewise. */
  private readonly coastLines: LineSegments[] = [];
  /** An empty geometry the outlines show while nothing is selected. */
  private readonly noOutline = new BufferGeometry();
  private readonly disposables: Disposable[] = [];
  private selected: RegionId | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param input - The partition and the coast to build from.
   */
  constructor(input: RegionTerritoriesInput) {
    this.object = new Group();
    this.object.name = "region-territories";
    this.disposables.push(this.noOutline);
    this.object.add(...this.createFills(input.cells));
    const borders = regionBorders(input.cells);
    this.object.add(this.createBorders(borders));
    this.createOutlines(input, borders);
    this.object.add(
      ...this.createSelection("territory-selection", this.borderLines, true),
      ...this.createSelection(
        "territory-selection-coast",
        this.coastLines,
        false,
      ),
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
   * @param regionId - The selected city's region, or `undefined`.
   */
  setSelected(regionId: RegionId | undefined): void {
    this.selected = regionId;
    this.showOutline(this.borderLines, regionId, this.borderOutlines);
    this.showOutline(this.coastLines, regionId, this.coastOutlines);
  }

  /** The region whose outline is lit, if any. */
  selectedRegion(): RegionId | undefined {
    return this.selected;
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
   * One fill mesh per region: every cell of the region fanned into
   * triangles in a single geometry, so the cells cannot overlap or gap.
   * Starts invisible; `setInfestation` shows it.
   */
  private createFills(cells: readonly TerritoryCell[]): Mesh[] {
    const positions = new Map<RegionId, number[]>();
    for (const cell of cells) {
      const list = positions.get(cell.regionId) ?? [];
      positions.set(cell.regionId, list);
      const [first, ...rest] = cell.vertices;
      if (!first) {
        continue;
      }
      for (let i = 1; i < rest.length; i++) {
        const b = rest[i - 1];
        const c = rest[i];
        if (b && c) {
          list.push(first.x, 0, first.z, b.x, 0, b.z, c.x, 0, c.z);
        }
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
      testLandStencil(material);
      const mesh = new Mesh(geometry, material);
      mesh.name = `territory-fill-${regionId}`;
      mesh.position.y = FILL_LIFT;
      mesh.renderOrder = TERRITORY_RENDER_ORDER;
      this.fills.set(regionId, material);
      this.disposables.push(geometry, material);
      return mesh;
    });
  }

  /** Every region border once, as one dim `LineSegments`. */
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
    testLandStencil(material);
    const lines = new LineSegments(geometry, material);
    lines.name = "territory-borders";
    lines.position.y = BORDER_LIFT;
    lines.renderOrder = TERRITORY_RENDER_ORDER;
    this.disposables.push(geometry, material);
    return lines;
  }

  /**
   * Two outline geometries per region: its borders with other regions,
   * and every coast segment whose midpoint falls in one of its cells.
   * They are kept apart because the borders must be clipped to land by
   * the stencil while the coast must not be: a coast segment lies
   * exactly on the stencil's edge, and tested against it only half its
   * pixels survive.
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
   * hidden until a region is selected. Transparent even at full
   * opacity so they draw in the transparent pass, after the land fill
   * has written the stencil the border half tests.
   *
   * @param name - Name of the core line; the glow passes are `${name}-glow-N`.
   * @param into - Where the created lines are kept for `setSelected`.
   * @param clipToLand - Whether the lines test the land stencil.
   */
  private createSelection(
    name: string,
    into: LineSegments[],
    clipToLand: boolean,
  ): LineSegments[] {
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
    if (clipToLand) {
      testLandStencil(core);
      testLandStencil(glow);
    }
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
