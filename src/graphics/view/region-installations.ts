import { Group } from "three";

import type { Vec3 } from "../../core/model/grid";
import type {
  Deployable,
  DeployableId,
} from "../../overworld/model/deployable";
import type { EarthMap } from "../../overworld/model/earth-map";
import type { RegionId } from "../../overworld/model/region";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import type { GroundPoint } from "../service/coastline-projection";
import { planInstallationSlots } from "../service/installation-layout";
import { layoutToWorld } from "../service/overworld-layout";
import type {
  InstallationLook,
  InstallationLookReport,
} from "./installation-marker";
import { InstallationMarker } from "./installation-marker";

// ===========================================
// Constants
// ===========================================

/** Name of the group every installation lives under. */
export const INSTALLATIONS_NAME = "installations";

// ===========================================
// Region installations
// ===========================================

/**
 * Every built installation on the strategic map (#1155), kept in step
 * with the campaign's deployables: one `InstallationMarker` per
 * deployable, standing at a planned slot around its region's anchor,
 * dimmed while offline, idling every frame. Holds no game truth.
 *
 * ```
 *   setMap(map)              ──► region anchors and city obstacles in world units
 *   sync(deployables)        ──► markers added, moved, retinted, removed
 *   update(dt)               ──► every marker's moving part turned
 * ```
 *
 * Slots are planned per region from the deployables sorted by id, so
 * the layout is a pure function of the state: a reload draws the same
 * picture, and removing one installation lets the rest close ranks.
 */
export class RegionInstallations implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; every installation lives under it. */
  readonly root = new Group();
  private readonly style: InstallationLook;
  private readonly config: OverworldSceneConfig;
  private readonly markers = new Map<DeployableId, InstallationMarker>();
  private readonly anchors = new Map<RegionId, GroundPoint>();
  private obstacles: GroundPoint[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param style - Model loader, animations, spray texture and stand-in geometry.
   * @param config - Plane extent, lift and installation spacing.
   */
  constructor(style: InstallationLook, config: OverworldSceneConfig) {
    this.style = style;
    this.config = config;
    this.root.name = INSTALLATIONS_NAME;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Learns where each region's anchor and every city stand, in world units. */
  setMap(map: EarthMap): void {
    this.anchors.clear();
    for (const region of map.regions) {
      const world = layoutToWorld(region.layout, this.config);
      this.anchors.set(region.id, { x: world.x, z: world.z });
    }
    this.obstacles = map.cities.map((city) => {
      const world = layoutToWorld(city.layout, this.config);
      return { x: world.x, z: world.z };
    });
  }

  /**
   * Brings the markers in step with the deployables: new ones are
   * placed, gone ones removed, and every survivor moved to its slot
   * and set online or offline.
   */
  sync(deployables: readonly Deployable[]): void {
    const wanted = new Set(deployables.map((deployable) => deployable.id));
    for (const [id, marker] of this.markers) {
      if (!wanted.has(id)) {
        marker.dispose();
        this.markers.delete(id);
      }
    }
    for (const [regionId, group] of byRegion(deployables)) {
      const anchor = this.anchors.get(regionId);
      if (!anchor) {
        continue;
      }
      const slots = planInstallationSlots(
        anchor,
        group.length,
        this.obstacles,
        {
          ringRadius: this.config.installationRingRadius,
          clearance: this.config.installationClearance,
          bounds: { width: this.config.mapWidth, depth: this.config.mapDepth },
        },
      );
      group.forEach((deployable, index) => {
        const slot = slots[index] ?? anchor;
        const at: Vec3 = { x: slot.x, y: this.config.markerLift, z: slot.z };
        const existing = this.markers.get(deployable.id);
        if (existing) {
          existing.moveTo(at);
          existing.setOnline(deployable.online);
          return;
        }
        const marker = new InstallationMarker(deployable, at, this.style);
        this.markers.set(deployable.id, marker);
        this.root.add(marker.object);
      });
    }
  }

  /** Turns every installation's moving part. */
  update(deltaSeconds: number): void {
    for (const marker of this.markers.values()) {
      marker.update(deltaSeconds);
    }
  }

  /** What one installation shows, or `undefined` for an unknown id. */
  look(id: DeployableId): InstallationLookReport | undefined {
    return this.markers.get(id)?.look();
  }

  /** Ids of the installations drawn, in no particular order. */
  ids(): DeployableId[] {
    return [...this.markers.keys()];
  }

  /** World position of one installation, or `undefined` for an unknown id. */
  worldPosition(id: DeployableId): Vec3 | undefined {
    const marker = this.markers.get(id);
    if (!marker) {
      return undefined;
    }
    const { x, y, z } = marker.object.position;
    return { x, y, z };
  }

  /** Removes and frees every marker; the shared look stays the builder's. */
  dispose(): void {
    for (const marker of this.markers.values()) {
      marker.dispose();
    }
    this.markers.clear();
    this.anchors.clear();
    this.obstacles = [];
    this.root.clear();
    this.root.removeFromParent();
  }
}

// ===========================================
// Helpers
// ===========================================

/** Deployables grouped by region, each group sorted by id for a stable layout. */
function byRegion(
  deployables: readonly Deployable[],
): Map<RegionId, Deployable[]> {
  const groups = new Map<RegionId, Deployable[]>();
  for (const deployable of deployables) {
    const group = groups.get(deployable.regionId) ?? [];
    group.push(deployable);
    groups.set(deployable.regionId, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return groups;
}
