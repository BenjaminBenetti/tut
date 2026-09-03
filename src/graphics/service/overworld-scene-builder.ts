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
import { citiesInRegion } from "../../overworld/service/earth-map-query-service";
import type { CityPicker } from "../model/city-picker";
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
import { RegionPlate } from "../view/region-plate";
import {
  layoutToWorld,
  mapCentre,
  regionPlateExtent,
} from "./overworld-layout";

// ===========================================
// Types
// ===========================================

/** What the builder is composed from. */
export interface OverworldSceneBuilderOptions {
  /** Scene sizes; defaults to `OVERWORLD_SCENE_CONFIG`. */
  readonly config?: OverworldSceneConfig;
  /** Loaded art; defaults to none, which paints flat colours and discs. */
  readonly assets?: OverworldSceneAssets;
}

// ===========================================
// Constants
// ===========================================

/** Ocean slab colour: `env-water-deep`, used for the sides and as the top's fallback. */
const OCEAN_COLOUR = 0x1f5c73;

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
 * step with later states: a slab whose top carries the Earth texture,
 * one translucent plate per region, one marker per city, plus
 * hit-testing for the pointer controller. Reads state, holds no game
 * truth (architecture §2.3). Art is optional: without the texture the
 * slab is flat ocean, without the glyph markers are discs.
 *
 * ```
 *   build(map)            ─▶  slab + plates + markers under `root`
 *   update(map, missions) ─▶  markers retinted and badged in place (same objects)
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
  private readonly raycaster = new Raycaster();
  private readonly markerGeometry: CityMarkerGeometry;
  private readonly markers = new Map<CityId, CityMarker>();
  private readonly targetToCity = new Map<Object3D, CityId>();
  private plates: RegionPlate[] = [];
  private slab: Mesh | undefined;
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

  /** True when the slab top carries the Earth texture rather than flat ocean. */
  usesMapTexture(): boolean {
    return this.assets.mapTexture !== undefined;
  }

  /** Builds every object from scratch, discarding anything built before. */
  build(map: EarthMap): void {
    this.clear();
    this.slab = this.createSlab();
    this.root.add(this.slab);
    for (const region of map.regions) {
      const extent = regionPlateExtent(
        region,
        citiesInRegion(map, region.id),
        this.config,
      );
      const plate = new RegionPlate(region, extent, this.config);
      this.plates.push(plate);
      this.root.add(plate.object);
    }
    for (const city of map.cities) {
      const ground = layoutToWorld(city.layout, this.config);
      const base = { x: ground.x, y: this.config.plateHeight, z: ground.z };
      const marker = new CityMarker(
        city,
        base,
        {
          geometry: this.markerGeometry,
          glyph: this.assets.markerGlyph,
          missionGlyph: this.assets.missionGlyph,
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
  }

  /** What a city's marker currently shows, or `undefined` for an unknown city. */
  markerLook(cityId: CityId): CityMarkerLookReport | undefined {
    return this.markers.get(cityId)?.look();
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
   * Builds the slab the plates sit on: exactly the map plane in extent,
   * so the Earth texture on its top face lines up with `layoutToWorld`
   * (texture `u` runs west → east along +x, the image top is north at
   * `z = 0`). Without the texture the top is flat ocean, unlit either way
   * so the palette reads exactly.
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
    const top = this.assets.mapTexture
      ? new MeshBasicMaterial({ map: this.assets.mapTexture })
      : new MeshBasicMaterial({ color: OCEAN_COLOUR });
    top.name = this.assets.mapTexture
      ? "overworld.earth-map"
      : "env-water-deep";
    const materials: Material[] = [side, side, side, side, side, side];
    materials[BOX_TOP_FACE] = top;
    const slab = new Mesh(geometry, materials);
    slab.name = "map-slab";
    const centre = this.centre;
    slab.position.set(centre.x, -this.config.oceanHeight / 2, centre.z);
    return slab;
  }

  /** Pushes hovered and selected state onto every marker. */
  private applyHighlights(): void {
    for (const [cityId, marker] of this.markers) {
      marker.setHovered(cityId === this.hovered);
      marker.setSelected(cityId === this.selected);
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
    for (const plate of this.plates) {
      plate.dispose();
    }
    if (this.slab) {
      this.slab.geometry.dispose();
      for (const material of new Set(materialsOf(this.slab))) {
        material.dispose();
      }
    }
    this.markers.clear();
    this.targetToCity.clear();
    this.plates = [];
    this.slab = undefined;
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
