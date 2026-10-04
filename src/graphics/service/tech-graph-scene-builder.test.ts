import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  RingGeometry,
} from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import {
  conditionalTechCatalogue,
  FX_FIELD_NOTES,
  FX_HEAVY_WEAPONS,
  FX_JUMP_JETS,
  FX_PHEROMONE_ANALYSIS,
  FX_POD_TELEMETRY,
  FX_SPRINT_FRAME,
  FX_SQUAD_ARMOUR,
  HIVE_CORE_SAMPLE,
  SPORE_SAMPLE,
  withFlags,
} from "../../tech/data/conditional-tech-tree.test-helper";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { NO_TECH_CONDITIONS } from "../../tech/model/tech-conditions";
import type { TechNodeId } from "../../tech/model/tech-node";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import { layoutTechGraph } from "../../ui/service/tech-graph-layout";
import type { ModelLoader } from "../model/model-loader";
import { MODULE_MODEL_NAME } from "./tech-node-model-source";
import {
  DEFAULT_CORE_MODEL,
  PEDESTAL_RADIUS,
  STORY_CROWN_NAME,
  TechGraphSceneBuilder,
  TURNTABLE_RATE,
} from "./tech-graph-scene-builder";

const LAYOUT = layoutTechGraph(
  new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES)),
  NO_TECH_CONDITIONS,
);

class FakeModelLoader implements ModelLoader {
  readonly loads: ModelAssetId[] = [];

  load(id: ModelAssetId): Promise<Object3D> {
    this.loads.push(id);
    const group = new Group();
    group.name = id;
    group.add(new Mesh(new BoxGeometry(1, 1, 1)));
    return Promise.resolve(group);
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }
}

/** A camera looking straight down at the graph, so ndc maps onto the ground plane. */
function topDownCamera(radius: number): OrthographicCamera {
  const camera = new OrthographicCamera(
    -radius,
    radius,
    radius,
    -radius,
    0.1,
    100,
  );
  camera.position.set(0, 50, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function ringOf(
  builder: TechGraphSceneBuilder,
  id: TechNodeId,
): MeshStandardMaterial {
  const root = builder.root.getObjectByName(`node:${id}`);
  const rim = root?.children.find(
    (child) => child instanceof Mesh && child.geometry instanceof RingGeometry,
  );
  if (
    !(rim instanceof Mesh) ||
    !(rim.material instanceof MeshStandardMaterial)
  ) {
    throw new Error(`no ring on ${id}`);
  }
  return rim.material;
}

describe("TechGraphSceneBuilder", () => {
  it("builds a pedestal per node, a plinth per family and a beam per edge before any model arrives", () => {
    const builder = new TechGraphSceneBuilder({
      layout: LAYOUT,
      models: new FakeModelLoader(),
    });
    for (const node of LAYOUT.nodes) {
      expect(builder.root.getObjectByName(`node:${node.id}`)).toBeDefined();
      expect(builder.worldPosition(node.id)).toEqual({
        x: node.x,
        y: 0,
        z: node.z,
      });
    }
    for (const family of LAYOUT.families) {
      expect(builder.root.getObjectByName(`family:${family.id}`)).toBeDefined();
      expect(builder.familyPosition(family.id)).toEqual({
        x: family.x,
        y: 0,
        z: family.z,
      });
    }
    const beams = builder.root.children.filter((child) =>
      child.name.startsWith("beam:"),
    );
    expect(beams).toHaveLength(LAYOUT.edges.length);
    builder.dispose();
  });

  it("draws nothing of a hidden node and stands a generic module on a node with no part (ADR 0013 §2.7)", async () => {
    const layout = layoutTechGraph(
      conditionalTechCatalogue(),
      NO_TECH_CONDITIONS,
    );
    const builder = new TechGraphSceneBuilder({
      layout,
      models: new FakeModelLoader(),
    });
    for (const hidden of [FX_PHEROMONE_ANALYSIS, FX_POD_TELEMETRY]) {
      expect(builder.root.getObjectByName(`node:${hidden}`)).toBeUndefined();
      expect(builder.root.getObjectByName(`beam:${hidden}`)).toBeUndefined();
      expect(builder.worldPosition(hidden)).toBeUndefined();
    }
    // The energy family holds only hidden nodes, so it has no plinth.
    expect(builder.root.getObjectByName("family:energy")).toBeUndefined();
    expect(builder.root.getObjectByName(`node:${FX_JUMP_JETS}`)).toBeDefined();
    await builder.loadModels();
    const notes = builder.root
      .getObjectByName(`node:${FX_FIELD_NOTES}`)
      ?.getObjectByName("turntable");
    expect(notes?.getObjectByName(MODULE_MODEL_NAME)).toBeDefined();
    builder.dispose();
  });

  it("loads one model per node and the core, and turns them on the frame loop", async () => {
    const loader = new FakeModelLoader();
    const builder = new TechGraphSceneBuilder({
      layout: LAYOUT,
      models: loader,
    });
    await builder.loadModels();
    expect(loader.loads).toContain(DEFAULT_CORE_MODEL);
    expect(loader.loads).toContain("tdf.mech.legs.jumper");
    const turntable = builder.root
      .getObjectByName("node:tech.jump-jets")
      ?.getObjectByName("turntable");
    expect(turntable?.children).toHaveLength(1);
    const before = turntable?.rotation.y ?? 0;
    builder.turntables.update(1);
    expect(turntable?.rotation.y).toBeCloseTo(before + TURNTABLE_RATE, 5);
    builder.dispose();
  });

  it("tints rings and beams by status, and lights hover and selection on top", () => {
    const builder = new TechGraphSceneBuilder({
      layout: LAYOUT,
      models: new FakeModelLoader(),
    });
    const statuses = new Map<TechNodeId, TechNodeStatus>([
      ["tech.jump-jets", "unlocked"],
      ["tech.all-terrain", "available"],
      ["tech.sprint-frame", "unaffordable"],
    ]);
    builder.setStatuses(statuses);
    expect(builder.statusOf("tech.jump-jets")).toBe("unlocked");
    expect(builder.statusOf("tech.railgun")).toBe("locked");
    const unlocked = ringOf(builder, "tech.jump-jets");
    const locked = ringOf(builder, "tech.railgun");
    expect(unlocked.color.getHex()).not.toBe(locked.color.getHex());
    expect(unlocked.emissiveIntensity).toBeGreaterThan(
      locked.emissiveIntensity,
    );

    const restingGlow = unlocked.emissiveIntensity;
    builder.setHovered("tech.jump-jets");
    expect(unlocked.emissiveIntensity).toBeGreaterThan(restingGlow);
    builder.setHovered(undefined);
    expect(unlocked.emissiveIntensity).toBe(restingGlow);

    const halo = builder.root
      .getObjectByName("node:tech.jump-jets")
      ?.children.find(
        (c) =>
          c instanceof Mesh &&
          c.geometry instanceof RingGeometry &&
          c.position.y < 0.05,
      );
    expect(halo?.visible).toBe(false);
    builder.setSelected("tech.jump-jets");
    expect(halo?.visible).toBe(true);
    expect(builder.getSelected()).toBe("tech.jump-jets");
    builder.setSelected(undefined);
    expect(halo?.visible).toBe(false);
    builder.dispose();
  });

  it("crowns every story node's pedestal in gold dashes, whatever its status, and no other node (#1237)", () => {
    const layout = layoutTechGraph(
      conditionalTechCatalogue(),
      withFlags(SPORE_SAMPLE, HIVE_CORE_SAMPLE),
    );
    const builder = new TechGraphSceneBuilder({
      layout,
      models: new FakeModelLoader(),
    });
    const crownOf = (id: TechNodeId): Object3D | undefined =>
      builder.root
        .getObjectByName(`node:${id}`)
        ?.getObjectByName(STORY_CROWN_NAME);
    for (const id of [
      FX_JUMP_JETS,
      FX_SPRINT_FRAME,
      FX_SQUAD_ARMOUR,
      FX_HEAVY_WEAPONS,
    ]) {
      expect(builder.root.getObjectByName(`node:${id}`), id).toBeDefined();
      expect(crownOf(id), id).toBeUndefined();
    }
    const statuses: TechNodeStatus[] = [
      "locked",
      "unaffordable",
      "available",
      "unlocked",
    ];
    for (const id of [
      FX_PHEROMONE_ANALYSIS,
      FX_POD_TELEMETRY,
      FX_FIELD_NOTES,
    ]) {
      const crown = crownOf(id);
      expect(crown, id).toBeDefined();
      // Dashes, not a ring: every segment leaves a gap before the next,
      // and they all lie outside the selection halo.
      const dashes = crown?.children ?? [];
      expect(dashes.length, id).toBeGreaterThanOrEqual(8);
      for (const dash of dashes) {
        if (
          !(dash instanceof Mesh) ||
          !(dash.geometry instanceof RingGeometry)
        ) {
          throw new Error(`${id}: a crown dash is not a ring segment`);
        }
        const { innerRadius, thetaLength } = dash.geometry.parameters;
        expect(thetaLength).toBeLessThan((Math.PI * 2) / dashes.length);
        expect(innerRadius).toBeGreaterThan(PEDESTAL_RADIUS + 0.22);
      }
      for (const status of statuses) {
        builder.setStatuses(new Map([[id, status]]));
        expect(crown?.visible, `${id} ${status}`).toBe(true);
      }
    }
    builder.dispose();
  });

  it("crowns exactly the shipped Intel projects and Last Hope once their flags are in hand", () => {
    const layout = layoutTechGraph(
      new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES)),
      withFlags(
        "spore-sample",
        "hive-core-sample",
        "uplink-won",
        "platform-failed",
      ),
    );
    const builder = new TechGraphSceneBuilder({
      layout,
      models: new FakeModelLoader(),
    });
    const crowned = layout.nodes
      .filter((node) =>
        builder.root
          .getObjectByName(`node:${node.id}`)
          ?.getObjectByName(STORY_CROWN_NAME),
      )
      .map((node) => node.id);
    expect(crowned.sort()).toEqual(
      [
        "tech.last-hope",
        "tech.pheromone-analysis",
        "tech.platform-approach",
        "tech.pod-telemetry",
      ].sort(),
    );
    builder.dispose();
  });

  it("picks the node under the pointer and nothing on empty ground", () => {
    const builder = new TechGraphSceneBuilder({
      layout: LAYOUT,
      models: new FakeModelLoader(),
    });
    const camera = topDownCamera(LAYOUT.radius);
    const node = LAYOUT.nodes[0];
    expect(node).toBeDefined();
    if (!node) return;
    // Looking down -y from +y with lookAt, screen-up is -z: ndc.y = -z / radius.
    const ndc = { x: node.x / LAYOUT.radius, y: -node.z / LAYOUT.radius };
    expect(builder.pick(ndc, camera)).toBe(node.id);
    // The core is not a node.
    expect(builder.pick({ x: 0, y: 0 }, camera)).toBeUndefined();
    builder.dispose();
  });
});
