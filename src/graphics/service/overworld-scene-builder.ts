import type { Camera } from "three";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
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
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import type { CityMarkerGeometry } from "../view/city-marker";
import { CityMarker } from "../view/city-marker";
import { RegionPlate } from "../view/region-plate";
import {
  layoutToWorld,
  mapCentre,
  regionPlateExtent,
} from "./overworld-layout";

// ===========================================
// Constants
// ===========================================

/** Ocean slab colour: `env-water-deep`. */
const OCEAN_COLOUR = 0x1f5c73;

/** How far the ocean slab extends past the map plane on each side. */
const OCEAN_MARGIN = 1;

/**
 * Radial segments for marker discs. Deliberately not a multiple of 8:
 * the camera always looks along a 45° diagonal, and with 8 or 16
 * segments a cap edge lies exactly on that diagonal, so a ray through a
 * marker's centre hits the shared edge and both triangles reject it.
 */
const MARKER_SEGMENTS = 12;

/** Selection ring radii relative to the marker radius. */
const RING_INNER_SCALE = 1.5;
const RING_OUTER_SCALE = 2;

// ===========================================
// Builder
// ===========================================

/**
 * Builds the strategic map scene from an `EarthMap` and keeps it in
 * step with later states: an ocean slab, one plate per region, one
 * marker per city, plus hit-testing for the pointer controller. Reads
 * state, holds no game truth (architecture §2.3).
 *
 * ```
 *   build(map)   ─▶  ocean + plates + markers under `root`
 *   update(map)  ─▶  markers recoloured in place (same objects)
 *   pickCity()   ─▶  raycast against marker bodies
 *   dispose()    ─▶  everything released, `root` emptied
 * ```
 */
export class OverworldSceneBuilder implements CityPicker {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. Everything the builder creates lives under it. */
  readonly root: Group;
  private readonly config: OverworldSceneConfig;
  private readonly raycaster = new Raycaster();
  private readonly markerGeometry: CityMarkerGeometry;
  private readonly markers = new Map<CityId, CityMarker>();
  private readonly bodyToCity = new Map<Mesh, CityId>();
  private plates: RegionPlate[] = [];
  private ocean: Mesh | undefined;
  private hovered: CityId | undefined;
  private selected: CityId | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param config - Scene sizes; defaults to `OVERWORLD_SCENE_CONFIG`.
   */
  constructor(config: OverworldSceneConfig = OVERWORLD_SCENE_CONFIG) {
    this.config = config;
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
    this.ocean = this.createOcean();
    this.root.add(this.ocean);
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
        this.markerGeometry,
        this.config,
      );
      this.markers.set(city.id, marker);
      this.bodyToCity.set(marker.body, city.id);
      this.root.add(marker.object);
    }
    this.applyHighlights();
  }

  /**
   * Brings the scene up to date with a newer map. Markers are recoloured
   * in place; nothing is rebuilt unless the set of cities changed, which
   * falls back to `build`.
   */
  update(map: EarthMap): void {
    if (!this.hasSameCities(map)) {
      this.build(map);
      return;
    }
    for (const city of map.cities) {
      this.markers.get(city.id)?.setInfestation(city.infestation);
    }
  }

  /** Releases every geometry and material and empties `root`. */
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
   * Raycasts marker bodies from a normalised device coordinate and
   * returns the nearest hit. World matrices are refreshed first so a
   * pick between frames sees the current layout.
   */
  pickCity(ndc: Vec2, camera: Camera): CityId | undefined {
    if (this.bodyToCity.size === 0) {
      return undefined;
    }
    this.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hits = this.raycaster.intersectObjects(
      [...this.bodyToCity.keys()],
      false,
    );
    const first = hits[0];
    return first ? this.bodyToCity.get(first.object as Mesh) : undefined;
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

  /** World position of a city's marker, or `undefined` for an unknown city. */
  markerWorldPosition(cityId: CityId): Vec3 | undefined {
    const marker = this.markers.get(cityId);
    if (!marker) {
      return undefined;
    }
    this.root.updateMatrixWorld(true);
    const position = marker.object.getWorldPosition(new Vector3());
    return { x: position.x, y: position.y, z: position.z };
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Builds the ocean slab the plates sit on.
   *
   * @returns The slab, with its top at `y = 0`.
   */
  private createOcean(): Mesh {
    const geometry = new BoxGeometry(
      this.config.mapWidth + 2 * OCEAN_MARGIN,
      this.config.oceanHeight,
      this.config.mapDepth + 2 * OCEAN_MARGIN,
    );
    const material = new MeshStandardMaterial({
      color: OCEAN_COLOUR,
      flatShading: true,
      metalness: 0,
      roughness: 0.9,
    });
    material.name = "env-water-deep";
    const ocean = new Mesh(geometry, material);
    ocean.name = "ocean";
    const centre = this.centre;
    ocean.position.set(centre.x, -this.config.oceanHeight / 2, centre.z);
    return ocean;
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
    if (this.ocean) {
      this.ocean.geometry.dispose();
      (this.ocean.material as MeshStandardMaterial).dispose();
    }
    this.markers.clear();
    this.bodyToCity.clear();
    this.plates = [];
    this.ocean = undefined;
    this.root.clear();
  }
}
