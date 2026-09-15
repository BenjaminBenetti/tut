import type { Camera, Material, Object3D } from "three";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CityId } from "../../overworld/model/city";
import type { EarthMap } from "../../overworld/model/earth-map";
import type { RegionId } from "../../overworld/model/region";
import { citiesInRegion } from "../../overworld/service/earth-map-query-service";
import { EARTH_COASTLINES } from "../data/earth-coastlines";
import type { CityPicker } from "../model/city-picker";
import type { EarthCoastlines } from "../model/earth-coastlines";
import type { OverworldSceneAssets } from "../model/overworld-scene-assets";
import { NO_OVERWORLD_ASSETS } from "../model/overworld-scene-assets";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import type { MapStateView } from "../model/map-state-view";
import type {
  CityMarkerGeometry,
  CityMarkerLookReport,
} from "../view/city-marker";
import { CityMarker } from "../view/city-marker";
import { EarthWireframe } from "../view/earth-wireframe";
import { RegionTerritories } from "../view/region-territories";
import { partitionClaimableLand } from "./claimable-land";
import type { GroundPolygon } from "./coastline-projection";
import { projectCoastlines } from "./coastline-projection";
import { coastlineSegments } from "./coastline-segments";
import { layoutToWorld, mapCentre } from "./overworld-layout";
import type { TerritorySeed } from "./region-territory-service";
import { computeTerritories } from "./region-territory-service";

// ===========================================
// Types
// ===========================================

/** What the builder is composed from. */
export interface OverworldSceneBuilderOptions {
  /** Scene sizes; defaults to `OVERWORLD_SCENE_CONFIG`. */
  readonly config?: OverworldSceneConfig;
  /** Loaded art; defaults to none, which draws disc markers. */
  readonly assets?: OverworldSceneAssets;
  /** Coastlines to draw the Earth from; defaults to the shipped Natural Earth set. */
  readonly coastlines?: EarthCoastlines;
}

// ===========================================
// Constants
// ===========================================

/** Slab side colour: `env-water-deep`. */
const OCEAN_COLOUR = 0x1f5c73;

/** Slab top colour: `ui-bg`, the near-black ground the wireframe Earth is drawn on (#1144). */
const GROUND_COLOUR = 0x0b0d12;

/** `BoxGeometry` material slot for the +y face (order: +x, −x, +y, −y, +z, −z). */
const BOX_TOP_FACE = 2;

/**
 * Radial segments for marker discs. Deliberately not a multiple of 8:
 * the camera always looks along a 45° diagonal, and with 8 or 16
 * segments a cap edge lies exactly on that diagonal, so a ray through a
 * marker's centre hits the shared edge and both triangles reject it.
 */
const MARKER_SEGMENTS = 12;

/** The empty mission set, for `update` calls that only carry a map. */
const NO_CITIES: ReadonlySet<CityId> = new Set();

/** Selection ring radii relative to the marker radius. */
const RING_INNER_SCALE = 1.5;
const RING_OUTER_SCALE = 2;

// ===========================================
// Builder
// ===========================================

/**
 * Builds the strategic map scene from an `EarthMap` and keeps it in
 * step with later states: a near-black slab with the wireframe Earth
 * drawn on it, the regions as territories divided from the city
 * positions (#1149), one marker per city, plus hit-testing for the
 * pointer controller. Reads state, holds no game truth (architecture
 * §2.3). Art is optional: without the glyph markers are discs.
 *
 * ```
 *   build(map)            ─▶  slab + wireframe + territories + markers under `root`
 *   update(map, missions) ─▶  markers and territories retinted in place (same objects)
 *   pickCity()   ─▶  raycast against marker pick targets
 *   dispose()    ─▶  everything released, `root` emptied
 * ```
 */
export class OverworldSceneBuilder implements CityPicker, MapStateView {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. Everything the builder creates lives under it. */
  readonly root: Group;
  private readonly config: OverworldSceneConfig;
  private readonly assets: OverworldSceneAssets;
  /** Land masses on the ground plane, projected once; the wireframe is built from them. */
  private readonly landPolygons: readonly GroundPolygon[];
  private readonly raycaster = new Raycaster();
  private readonly markerGeometry: CityMarkerGeometry;
  private readonly markers = new Map<CityId, CityMarker>();
  private readonly targetToCity = new Map<Object3D, CityId>();
  /** Which region each city belongs to, for the selected region's outline. */
  private readonly regionOfCity = new Map<CityId, RegionId>();
  private slab: Mesh | undefined;
  private wireframe: EarthWireframe | undefined;
  private territories: RegionTerritories | undefined;
  private hovered: CityId | undefined;
  private selected: CityId | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param options - Sizes and loaded art; both optional.
   */
  constructor(options: OverworldSceneBuilderOptions = {}) {
    const config = options.config ?? OVERWORLD_SCENE_CONFIG;
    this.config = config;
    this.assets = options.assets ?? NO_OVERWORLD_ASSETS;
    this.landPolygons = projectCoastlines(
      options.coastlines ?? EARTH_COASTLINES,
      config,
    );
    this.root = new Group();
    this.root.name = "overworld-map";
    this.markerGeometry = {
      body: new CylinderGeometry(
        config.markerRadius,
        config.markerRadius,
        config.markerHeight,
        MARKER_SEGMENTS,
      ),
      ring: new RingGeometry(
        config.markerRadius * RING_INNER_SCALE,
        config.markerRadius * RING_OUTER_SCALE,
        MARKER_SEGMENTS * 2,
      ),
    };
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Centre of the map plane; point the camera here. */
  get centre(): Vec3 {
    return mapCentre(this.config);
  }

  /** Builds every object from scratch, discarding anything built before. */
  build(map: EarthMap): void {
    this.clear();
    this.slab = this.createSlab();
    this.root.add(this.slab);
    this.wireframe = new EarthWireframe(this.landPolygons, this.config);
    this.root.add(this.wireframe.object);
    for (const region of map.regions) {
      for (const city of citiesInRegion(map, region.id)) {
        this.regionOfCity.set(city.id, region.id);
      }
    }
    this.territories = this.createTerritories(map);
    this.root.add(this.territories.object);
    for (const city of map.cities) {
      const ground = layoutToWorld(city.layout, this.config);
      const base = { x: ground.x, y: this.config.markerLift, z: ground.z };
      const marker = new CityMarker(
        city,
        base,
        {
          geometry: this.markerGeometry,
          glyph: this.assets.markerGlyph,
          missionGlyph: this.assets.missionGlyph,
          text: this.assets.text,
        },
        this.config,
      );
      this.markers.set(city.id, marker);
      this.targetToCity.set(marker.pickTarget, city.id);
      this.root.add(marker.object);
    }
    this.applyHighlights();
  }

  /**
   * Brings the scene up to date with a newer map and the cities that
   * currently host a mission. Markers are retinted and badged in place;
   * nothing is rebuilt unless the set of cities changed, which falls
   * back to `build` (and then badges).
   */
  update(map: EarthMap, missionCityIds: ReadonlySet<CityId> = NO_CITIES): void {
    if (!this.hasSameCities(map)) {
      this.build(map);
    }
    for (const city of map.cities) {
      const marker = this.markers.get(city.id);
      marker?.setInfestation(city.infestation);
      marker?.setMission(missionCityIds.has(city.id));
    }
    this.applyRegionInfestation(map);
  }

  /** What a city's marker currently shows, or `undefined` for an unknown city. */
  markerLook(cityId: CityId): CityMarkerLookReport | undefined {
    return this.markers.get(cityId)?.look();
  }

  /** The region territories as built, or `undefined` before `build`. */
  regionTerritories(): RegionTerritories | undefined {
    return this.territories;
  }

  /**
   * Releases every geometry and material and empties `root`. The loaded
   * art in `assets` belongs to whoever loaded it and is left alone.
   */
  dispose(): void {
    this.clear();
    this.markerGeometry.body.dispose();
    this.markerGeometry.ring.dispose();
  }

  /** Ids of the cities currently built, in map order. */
  cityIds(): readonly CityId[] {
    return [...this.markers.keys()];
  }

  // ===========================================
  // CityPicker
  // ===========================================

  /**
   * Raycasts marker pick targets from a normalised device coordinate.
   * Glyph sprites are billboards taller than the gap between close
   * cities, so several can sit under one ray; the hit whose marker
   * anchor is nearest the ray wins, which makes a click near a pin's
   * base pick that pin even inside a cluster. World matrices are
   * refreshed first so a pick between frames sees the current layout.
   */
  pickCity(ndc: Vec2, camera: Camera): CityId | undefined {
    if (this.targetToCity.size === 0) {
      return undefined;
    }
    this.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hits = this.raycaster.intersectObjects(
      [...this.targetToCity.keys()],
      false,
    );
    let best: CityId | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    const anchor = new Vector3();
    for (const hit of hits) {
      const cityId = this.targetToCity.get(hit.object);
      const marker =
        cityId === undefined ? undefined : this.markers.get(cityId);
      if (!marker) {
        continue;
      }
      marker.object.getWorldPosition(anchor);
      const distance = this.raycaster.ray.distanceToPoint(anchor);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cityId;
      }
    }
    return best;
  }

  /** Highlights one marker as hovered, or none. */
  setHovered(cityId: CityId | undefined): void {
    this.hovered = cityId;
    this.applyHighlights();
  }

  /** Marks one marker as selected, or none. */
  setSelected(cityId: CityId | undefined): void {
    this.selected = cityId;
    this.applyHighlights();
  }

  /** The selected city, if any. */
  getSelected(): CityId | undefined {
    return this.selected;
  }

  /** A world point inside a city's marker, or `undefined` for an unknown city. */
  markerWorldPosition(cityId: CityId): Vec3 | undefined {
    const marker = this.markers.get(cityId);
    if (!marker) {
      return undefined;
    }
    this.root.updateMatrixWorld(true);
    return marker.pickPoint();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Divides the map into region territories from the cities' own
   * positions (#1149): a Voronoi cell per city in world units, tagged
   * with its region, over the land Antarctica is left out of.
   */
  private createTerritories(map: EarthMap): RegionTerritories {
    const seeds: TerritorySeed[] = map.cities.map((city) => {
      const world = layoutToWorld(city.layout, this.config);
      return {
        cityId: city.id,
        regionId: city.regionId,
        point: { x: world.x, z: world.z },
      };
    });
    const cells = computeTerritories(seeds, {
      width: this.config.mapWidth,
      depth: this.config.mapDepth,
    });
    const land = partitionClaimableLand(this.landPolygons, this.config);
    return new RegionTerritories({
      cells,
      coast: coastlineSegments(land.claimable, this.config),
    });
  }

  /**
   * Builds the slab the wireframe and territories sit on: exactly the
   * map plane in extent, its top the unlit `ui-bg` ground the vector
   * Earth is drawn on (#1144), its sides the ocean tone.
   *
   * @returns The slab, with its top at `y = 0`.
   */
  private createSlab(): Mesh {
    const geometry = new BoxGeometry(
      this.config.mapWidth,
      this.config.oceanHeight,
      this.config.mapDepth,
    );
    const side = new MeshStandardMaterial({
      color: OCEAN_COLOUR,
      flatShading: true,
      metalness: 0,
      roughness: 0.9,
    });
    side.name = "env-water-deep";
    const top = new MeshBasicMaterial({ color: GROUND_COLOUR });
    top.name = "ui-bg";
    const materials: Material[] = [side, side, side, side, side, side];
    materials[BOX_TOP_FACE] = top;
    const slab = new Mesh(geometry, materials);
    slab.name = "map-slab";
    const centre = this.centre;
    slab.position.set(centre.x, -this.config.oceanHeight / 2, centre.z);
    return slab;
  }

  /** Pushes hovered and selected state onto every marker and the region outline. */
  private applyHighlights(): void {
    for (const [cityId, marker] of this.markers) {
      marker.setHovered(cityId === this.hovered);
      marker.setSelected(cityId === this.selected);
    }
    const active =
      this.selected === undefined
        ? undefined
        : this.regionOfCity.get(this.selected);
    this.territories?.setSelected(active);
  }

  /**
   * Fills each region with the infestation of its worst city (#440).
   * The worst rather than the average, because one city about to fall is
   * what a commander needs to see; averaging hides it behind its clean
   * neighbours.
   */
  private applyRegionInfestation(map: EarthMap): void {
    const worst = new Map<RegionId, number>();
    for (const city of map.cities) {
      const regionId = this.regionOfCity.get(city.id);
      if (regionId === undefined) {
        continue;
      }
      worst.set(regionId, Math.max(worst.get(regionId) ?? 0, city.infestation));
    }
    for (const region of map.regions) {
      this.territories?.setInfestation(region.id, worst.get(region.id) ?? 0);
    }
  }

  /** True when the map's cities match the markers built, id for id. */
  private hasSameCities(map: EarthMap): boolean {
    if (map.cities.length !== this.markers.size) {
      return false;
    }
    return map.cities.every((city) => this.markers.has(city.id));
  }

  /** Disposes and removes everything built; keeps the shared geometries. */
  private clear(): void {
    for (const marker of this.markers.values()) {
      marker.dispose();
    }
    this.territories?.dispose();
    if (this.slab) {
      this.slab.geometry.dispose();
      for (const material of new Set(materialsOf(this.slab))) {
        material.dispose();
      }
    }
    this.wireframe?.dispose();
    this.markers.clear();
    this.targetToCity.clear();
    this.regionOfCity.clear();
    this.slab = undefined;
    this.wireframe = undefined;
    this.territories = undefined;
    this.root.clear();
  }
}

// ===========================================
// Helpers
// ===========================================

/** A mesh's materials as a list, whether it has one or several. */
function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}
