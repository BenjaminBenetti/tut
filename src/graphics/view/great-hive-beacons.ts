import type { Material } from "three";
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
} from "three";

import type { EarthMap } from "../../overworld/model/earth-map";
import type { GreatHive, GreatHiveId } from "../../overworld/model/great-hive";
import { isGreatHiveStanding } from "../../overworld/model/great-hive";
import type { RegionId } from "../../overworld/model/region";
import type { Disposable } from "../model/disposable";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { layoutToWorld } from "../service/overworld-layout";

// ===========================================
// Constants
// ===========================================

/** Name of the group every Great Hive beacon lives under. */
export const GREAT_HIVE_BEACONS_NAME = "great-hive-beacons";

/** A standing beacon's colour: `ui-bug`, the acid green every bug cue wears. */
const STANDING_COLOUR = 0x9cff3d;

/** A fallen beacon's colour: a dead grey that reads as "done" on the dark slab. */
const FALLEN_COLOUR = 0x4a4d55;

/** Beam height in world units: well above any settlement model, so it reads from the default zoom. */
const BEAM_HEIGHT = 1.6;

/** Beam radius at its foot and at its tip. */
const BEAM_FOOT = 0.07;
const BEAM_TIP = 0.015;

/** The ground ring's inner and outer radius, clear of the seat's own settlements. */
const RING_INNER = 0.34;
const RING_OUTER = 0.42;

/** The hive mass at the beam's foot. */
const CORE_RADIUS = 0.16;

/** Radial segments; not a multiple of 8, as the scene's other solids (see `MARKER_SEGMENTS`). */
const SEGMENTS = 12;

// ===========================================
// Types
// ===========================================

/** What one beacon shows, for tests and the capture harness. */
export interface GreatHiveBeaconLook {
  readonly regionId: RegionId;
  readonly standing: boolean;
  /** Whether the beam is drawn: only while the Great Hive stands. */
  readonly beam: boolean;
  readonly x: number;
  readonly z: number;
}

/** One beacon's meshes and the materials it owns. */
interface Beacon {
  readonly object: Group;
  readonly beam: Mesh;
  readonly materials: readonly MeshBasicMaterial[];
  regionId: RegionId;
  standing: boolean;
}

// ===========================================
// Great Hive beacons
// ===========================================

/**
 * The three Great Hives on the strategic map (campaign arc §6.9, #1179):
 * one beacon over each seat region, a distinct shape from every other
 * marker — a tall acid-green beam over a ring and a hive mass — so the
 * platform's three beacons read at the default zoom. A fallen Great
 * Hive keeps a grey ring and mass without its beam, so the map says
 * how many are left.
 *
 * ```
 *        │        beam        BEAM_HEIGHT, standing only
 *        │
 *       ◆         hive mass   CORE_RADIUS
 *    ( ─── )      ring        RING_INNER..RING_OUTER, flat on the slab
 * ```
 *
 * Reads state, holds no game truth: `sync` is handed the Great Hives
 * each update and adds, retints or removes beacons to match.
 */
export class GreatHiveBeacons implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; every beacon lives under it. */
  readonly root = new Group();
  private readonly config: OverworldSceneConfig;
  private readonly beamGeometry = new CylinderGeometry(
    BEAM_TIP,
    BEAM_FOOT,
    BEAM_HEIGHT,
    SEGMENTS,
  );
  private readonly ringGeometry = new RingGeometry(
    RING_INNER,
    RING_OUTER,
    SEGMENTS * 3,
  );
  private readonly coreGeometry = new OctahedronGeometry(CORE_RADIUS);
  private readonly anchors = new Map<RegionId, { x: number; z: number }>();
  private readonly beacons = new Map<GreatHiveId, Beacon>();

  // ===========================================
  // Constructor
  // ===========================================

  /** @param config - Plane extent and marker lift. */
  constructor(config: OverworldSceneConfig) {
    this.config = config;
    this.root.name = GREAT_HIVE_BEACONS_NAME;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Learns where each region's anchor stands, in world units. */
  setMap(map: EarthMap): void {
    this.anchors.clear();
    for (const region of map.regions) {
      const world = layoutToWorld(region.layout, this.config);
      this.anchors.set(region.id, { x: world.x, z: world.z });
    }
  }

  /**
   * Brings the beacons in step with the Great Hives: new ones raised
   * over their seat, fallen ones greyed and their beam dropped, and any
   * the state no longer names removed.
   */
  sync(greatHives: readonly GreatHive[]): void {
    const wanted = new Set(greatHives.map((hive) => hive.id));
    for (const [id, beacon] of this.beacons) {
      if (!wanted.has(id)) {
        this.remove(id, beacon);
      }
    }
    for (const hive of greatHives) {
      const anchor = this.anchors.get(hive.regionId);
      if (anchor === undefined) {
        continue;
      }
      const beacon = this.beacons.get(hive.id) ?? this.raise(hive.id);
      beacon.regionId = hive.regionId;
      beacon.object.position.set(anchor.x, this.config.markerLift, anchor.z);
      this.setStanding(beacon, isGreatHiveStanding(hive));
    }
  }

  /** What the beacon of `id` shows, or `undefined` when none is drawn. */
  look(id: GreatHiveId): GreatHiveBeaconLook | undefined {
    const beacon = this.beacons.get(id);
    if (beacon === undefined) {
      return undefined;
    }
    return {
      regionId: beacon.regionId,
      standing: beacon.standing,
      beam: beacon.beam.visible,
      x: beacon.object.position.x,
      z: beacon.object.position.z,
    };
  }

  /** Ids of the beacons currently drawn. */
  ids(): readonly GreatHiveId[] {
    return [...this.beacons.keys()];
  }

  /** Removes every beacon and releases the shared geometry. */
  dispose(): void {
    for (const [id, beacon] of this.beacons) {
      this.remove(id, beacon);
    }
    this.beamGeometry.dispose();
    this.ringGeometry.dispose();
    this.coreGeometry.dispose();
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Builds one beacon's meshes under `root`. */
  private raise(id: GreatHiveId): Beacon {
    const object = new Group();
    object.name = `great-hive-beacon:${id}`;
    const beamMaterial = glow(0.85);
    const ringMaterial = glow(0.9);
    const coreMaterial = glow(1);
    const beam = new Mesh(this.beamGeometry, beamMaterial);
    beam.position.y = BEAM_HEIGHT / 2;
    const ring = new Mesh(this.ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    const core = new Mesh(this.coreGeometry, coreMaterial);
    core.position.y = CORE_RADIUS;
    object.add(ring, core, beam);
    this.root.add(object);
    const beacon: Beacon = {
      object,
      beam,
      materials: [beamMaterial, ringMaterial, coreMaterial],
      regionId: "",
      standing: true,
    };
    this.beacons.set(id, beacon);
    return beacon;
  }

  /** Standing: green with its beam. Fallen: grey, no beam. */
  private setStanding(beacon: Beacon, standing: boolean): void {
    beacon.standing = standing;
    beacon.beam.visible = standing;
    for (const material of beacon.materials) {
      material.color.setHex(standing ? STANDING_COLOUR : FALLEN_COLOUR);
    }
  }

  /** Takes one beacon out of the scene and frees its materials. */
  private remove(id: GreatHiveId, beacon: Beacon): void {
    this.root.remove(beacon.object);
    for (const material of beacon.materials as readonly Material[]) {
      material.dispose();
    }
    this.beacons.delete(id);
  }
}

/** An unlit, see-through material in the standing colour. */
function glow(opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: STANDING_COLOUR,
    transparent: opacity < 1,
    opacity,
    side: DoubleSide,
    depthWrite: opacity >= 1,
  });
}
