import type { Camera, Material, Object3D } from "three";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { CityId } from "../../overworld/model/city";
import type { DeployableId } from "../../overworld/model/deployable";
import type { EarthMap } from "../../overworld/model/earth-map";
import type { RegionId } from "../../overworld/model/region";
import { citiesInRegion } from "../../overworld/service/earth-map-query-service";
import { DEPLOYABLE_ANIMATIONS } from "../data/deployable-animations";
import { EARTH_COASTLINES } from "../data/earth-coastlines";
import type { CityPicker } from "../model/city-picker";
import type { RegionPicker } from "../model/region-picker";
import type { EarthCoastlines } from "../model/earth-coastlines";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { MapSceneState } from "../model/map-scene-state";
import type { MapStateView } from "../model/map-state-view";
import type { OverworldSceneAssets } from "../model/overworld-scene-assets";
import { NO_OVERWORLD_ASSETS } from "../model/overworld-scene-assets";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import type {
  CityMarkerGeometry,
  CityMarkerLookReport,
} from "../view/city-marker";
import { CITY_STAND_IN_HEIGHT, CityMarker } from "../view/city-marker";
import { EarthWireframe } from "../view/earth-wireframe";
import type {
  InstallationLook,
  InstallationLookReport,
} from "../view/installation-marker";
import { INSTALLATION_STAND_IN_HEIGHT } from "../view/installation-marker";
import { RegionInstallations } from "../view/region-installations";
import { RegionTerritories } from "../view/region-territories";
import { partitionClaimableLand } from "./claimable-land";
import type { GroundPoint, GroundPolygon } from "./coastline-projection";
import { projectCoastlines } from "./coastline-projection";
import { coastlineSegments } from "./coastline-segments";
import { createFalloffTexture } from "./falloff-texture";
import { isOnLand } from "./land-query";
import { layoutToWorld, mapCentre } from "./overworld-layout";
import type { TerritoryCell, TerritorySeed } from "./region-territory-service";
import { cellAt, computeTerritories } from "./region-territory-service";

// ===========================================
// Types
// ===========================================

/** What the builder is composed from. */
export interface OverworldSceneBuilderOptions {
  /** Scene sizes; defaults to `OVERWORLD_SCENE_CONFIG`. */
  readonly config?: OverworldSceneConfig;
  /** Loaded art; defaults to none, which draws stand-in blocks. */
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

/** The map plane, `y = 0`, that a region pick raycasts against. */
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Radial segments for halos, rings and pick solids. Deliberately not a
 * multiple of 8: the camera always looks along a 45° diagonal, and with
 * 8 or 16 segments a cap edge lies exactly on that diagonal, so a ray
 * through a marker's centre hits the shared edge and both triangles
 * reject it.
 */
const MARKER_SEGMENTS = 12;

/**
 * Halo and selection ring radii relative to half the settlement
 * footprint: the halo is a thin line hugging the model's pad, the ring
 * a thin line just outside it, each over a wider faint glow band, and
 * all of it stays clear of a neighbouring settlement half a unit away.
 *
 * ```
 *   pad ─┤ glow ├─ halo ─┤   ring glow   ├─ ring
 *   1.0  1.02  1.10 1.17 1.30   1.40 1.47  1.58
 * ```
 */
const HALO_INNER_SCALE = 1.1;
const HALO_OUTER_SCALE = 1.17;
const HALO_GLOW_INNER_SCALE = 1.02;
const HALO_GLOW_OUTER_SCALE = 1.3;
const RING_INNER_SCALE = 1.4;
const RING_OUTER_SCALE = 1.47;
const RING_GLOW_INNER_SCALE = 1.3;
const RING_GLOW_OUTER_SCALE = 1.58;

/** Segments round a halo or ring: enough that it is a circle, not a polygon, at the closest zoom. */
const RING_SEGMENTS = MARKER_SEGMENTS * 4;

/**
 * The map's own fill light: a cool sky from `ui-info` over the near-black
 * ground, so settlement roofs pick up the map's cyan and their unlit
 * faces fall toward the ground rather than to flat grey. Lives under the
 * map root, so the tactical scene never sees it.
 */
const SKY_FILL_COLOUR = 0x7fd1ff;
const GROUND_FILL_COLOUR = 0x0b0d12;
const SKY_FILL_INTENSITY = 0.7;

// ===========================================
// Builder
// ===========================================

/**
 * Builds the strategic map scene from an `EarthMap` and keeps it in
 * step with later states: a near-black slab with the wireframe Earth
 * drawn on it, the regions as territories divided from the city
 * positions (#1149), one settlement model per city with its egg cue
 * (#1155), every built installation in its region, plus hit-testing
 * for the pointer controller. Reads state, holds no game truth
 * (architecture §2.3). Art is optional: without a model loader the
 * settlements and installations are stand-in blocks.
 *
 * ```
 *   build(map)     ─▶  slab + wireframe + territories + markers + installations under `root`
 *   update(state)  ─▶  markers retinted and egg-cued, installations synced, territories retinted
 *   animator       ─▶  tick every frame: installations idle
 *   pickCity()     ─▶  raycast against marker pick solids
 *   pickRegion()   ─▶  raycast the ground, then the cell the point falls in, on claimable land
 *   dispose()      ─▶  everything released, `root` emptied
 * ```
 */
export class OverworldSceneBuilder
  implements CityPicker, RegionPicker, MapStateView
{
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. Everything the builder creates lives under it. */
  readonly root: Group;
  /** Tick this every frame; it idles the installations. */
  readonly animator: FrameUpdatable;
  private readonly config: OverworldSceneConfig;
  private readonly assets: OverworldSceneAssets;
  /** Land masses on the ground plane, projected once; the wireframe is built from them. */
  private readonly landPolygons: readonly GroundPolygon[];
  /** The land regions may claim: the territories are cut to it and a region pick must land on it. */
  private readonly claimableLand: readonly GroundPolygon[];
  private readonly raycaster = new Raycaster();
  private readonly markerGeometry: CityMarkerGeometry;
  private readonly installationStyle: InstallationLook;
  private readonly markers = new Map<CityId, CityMarker>();
  private readonly targetToCity = new Map<Object3D, CityId>();
  /** Which region each city belongs to, for the selected region's outline. */
  private readonly regionOfCity = new Map<CityId, RegionId>();
  private slab: Mesh | undefined;
  private wireframe: EarthWireframe | undefined;
  private territories: RegionTerritories | undefined;
  private installations: RegionInstallations | undefined;
  /** The Voronoi partition the territories were built from; a region pick looks its cell up here. */
  private cells: readonly TerritoryCell[] = [];
  private hovered: CityId | undefined;
  private selected: CityId | undefined;
  /** A region picked by its land (#1155), with no city; a selected city's region is derived instead. */
  private hoveredRegion: RegionId | undefined;
  private selectedRegion: RegionId | undefined;

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
    this.claimableLand = partitionClaimableLand(
      this.landPolygons,
      config,
    ).claimable;
    this.root = new Group();
    this.root.name = "overworld-map";
    const half = config.settlementFootprint / 2;
    const band = (inner: number, outer: number): RingGeometry =>
      new RingGeometry(half * inner, half * outer, RING_SEGMENTS);
    this.markerGeometry = {
      halo: band(HALO_INNER_SCALE, HALO_OUTER_SCALE),
      haloGlow: band(HALO_GLOW_INNER_SCALE, HALO_GLOW_OUTER_SCALE),
      ring: band(RING_INNER_SCALE, RING_OUTER_SCALE),
      ringGlow: band(RING_GLOW_INNER_SCALE, RING_GLOW_OUTER_SCALE),
      pick: new CylinderGeometry(
        half,
        half,
        config.markerPickHeight,
        MARKER_SEGMENTS,
      ),
      standIn: new BoxGeometry(
        config.settlementFootprint,
        CITY_STAND_IN_HEIGHT,
        config.settlementFootprint,
      ),
    };
    this.installationStyle = {
      models: this.assets.models,
      animations: DEPLOYABLE_ANIMATIONS,
      falloff: createFalloffTexture(),
      standIn: new BoxGeometry(
        config.installationFootprint,
        INSTALLATION_STAND_IN_HEIGHT,
        config.installationFootprint,
      ),
    };
    this.animator = {
      update: (deltaSeconds) => {
        this.installations?.update(deltaSeconds);
      },
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
    this.root.add(this.createSkyFill());
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
          models: this.assets.models,
          text: this.assets.text,
        },
        this.config,
      );
      this.markers.set(city.id, marker);
      this.targetToCity.set(marker.pickTarget, city.id);
      this.root.add(marker.object);
    }
    this.installations = new RegionInstallations(
      this.installationStyle,
      this.config,
    );
    this.installations.setMap(map);
    this.root.add(this.installations.root);
    this.applyHighlights();
  }

  /**
   * Brings the scene up to date with a newer state: markers retinted
   * and egg-cued in place, installations placed, moved, dimmed or
   * removed, territories retinted. Nothing is rebuilt unless the set
   * of cities changed, which falls back to `build` first.
   */
  update(state: MapSceneState): void {
    if (!this.hasSameCities(state.map)) {
      this.build(state.map);
    }
    for (const city of state.map.cities) {
      const marker = this.markers.get(city.id);
      marker?.setInfestation(city.infestation);
      marker?.setMission(state.missionCueCityIds.has(city.id));
    }
    this.installations?.sync(state.deployables);
    this.applyRegionInfestation(state.map);
  }

  /** What a city's marker currently shows, or `undefined` for an unknown city. */
  markerLook(cityId: CityId): CityMarkerLookReport | undefined {
    return this.markers.get(cityId)?.look();
  }

  /** What an installation currently shows, or `undefined` for an unknown id. */
  installationLook(id: DeployableId): InstallationLookReport | undefined {
    return this.installations?.look(id);
  }

  /** World position of an installation, or `undefined` for an unknown id. */
  installationWorldPosition(id: DeployableId): Vec3 | undefined {
    return this.installations?.worldPosition(id);
  }

  /** Ids of the installations currently drawn. */
  installationIds(): readonly DeployableId[] {
    return this.installations?.ids() ?? [];
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
    this.markerGeometry.halo.dispose();
    this.markerGeometry.haloGlow.dispose();
    this.markerGeometry.ring.dispose();
    this.markerGeometry.ringGlow.dispose();
    this.markerGeometry.pick.dispose();
    this.markerGeometry.standIn.dispose();
    this.installationStyle.standIn.dispose();
    this.installationStyle.falloff.dispose();
  }

  /** Ids of the cities currently built, in map order. */
  cityIds(): readonly CityId[] {
    return [...this.markers.keys()];
  }

  // ===========================================
  // CityPicker
  // ===========================================

  /**
   * Raycasts marker pick solids from a normalised device coordinate.
   * Close cities' solids can overlap, so several can sit under one
   * ray; the hit whose marker anchor is nearest the ray wins, which
   * makes a click near a settlement's centre pick that settlement even
   * inside a cluster. World matrices are refreshed first so a pick
   * between frames sees the current layout.
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

  // ===========================================
  // RegionPicker
  // ===========================================

  /**
   * Raycasts the ground plane from a normalised device coordinate and
   * answers the region whose Voronoi cell the point falls in, provided
   * the point is on claimable land (#1155). Off the map, over the sea
   * or over the polar land no region claims, nothing is picked, so a
   * click there clears the selection rather than picking a neighbour.
   */
  pickRegion(ndc: Vec2, camera: Camera): RegionId | undefined {
    const ground = this.groundPointAt(ndc, camera);
    if (
      !ground ||
      ground.x < 0 ||
      ground.x > this.config.mapWidth ||
      ground.z < 0 ||
      ground.z > this.config.mapDepth ||
      !isOnLand(ground, this.claimableLand)
    ) {
      return undefined;
    }
    return cellAt(ground, this.cells)?.regionId;
  }

  /** Outlines one region as hovered, or none. */
  setHoveredRegion(regionId: RegionId | undefined): void {
    this.hoveredRegion = regionId;
    this.applyHighlights();
  }

  /** Marks one region as selected on its own, or none. */
  setSelectedRegion(regionId: RegionId | undefined): void {
    this.selectedRegion = regionId;
    this.applyHighlights();
  }

  /** The region selected on its own, if any; a selected city's region is not reported here. */
  getSelectedRegion(): RegionId | undefined {
    return this.selectedRegion;
  }

  // ===========================================
  // Positions
  // ===========================================

  /** A world point on a city's marker, or `undefined` for an unknown city. */
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
    this.cells = cells;
    return new RegionTerritories({
      cells,
      land: this.claimableLand,
      coast: coastlineSegments(this.claimableLand, this.config),
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

  /** The map's cool hemisphere fill; see `SKY_FILL_COLOUR`. */
  private createSkyFill(): HemisphereLight {
    const fill = new HemisphereLight(
      SKY_FILL_COLOUR,
      GROUND_FILL_COLOUR,
      SKY_FILL_INTENSITY,
    );
    fill.name = "map-sky-fill";
    return fill;
  }

  /**
   * Pushes hovered and selected state onto every marker and the region
   * outlines. A region lit on its own wins; otherwise the hovered or
   * selected city lights its own region.
   */
  private applyHighlights(): void {
    for (const [cityId, marker] of this.markers) {
      marker.setHovered(cityId === this.hovered);
      marker.setSelected(cityId === this.selected);
    }
    this.territories?.setSelected(
      this.selectedRegion ?? this.regionOfCityOrNone(this.selected),
    );
    this.territories?.setHovered(
      this.hoveredRegion ?? this.regionOfCityOrNone(this.hovered),
    );
  }

  /** The region a city belongs to, or `undefined` for no city or an unknown one. */
  private regionOfCityOrNone(cityId: CityId | undefined): RegionId | undefined {
    return cityId === undefined ? undefined : this.regionOfCity.get(cityId);
  }

  /**
   * Where a normalised device coordinate meets the ground plane, or
   * `undefined` when the ray never does.
   */
  private groundPointAt(ndc: Vec2, camera: Camera): GroundPoint | undefined {
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND_PLANE, new Vector3());
    return hit ? { x: hit.x, z: hit.z } : undefined;
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
    this.installations?.dispose();
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
    this.cells = [];
    this.slab = undefined;
    this.wireframe = undefined;
    this.territories = undefined;
    this.installations = undefined;
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
