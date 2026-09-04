import { InstancedMesh } from "three";
import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import {
  campaignOnDay,
  missionAt,
} from "../../ui/view/mission-fixtures.test-helper";
import {
  EMPTY_OVERLAYS,
  TacticalOverlays,
  overlaysFor,
} from "./tactical-overlays";

/** A live mission with the whole starter roster deployed. */
function mission(): TacticalState {
  const state = campaignOnDay(4, [missionAt("mission-2", "lagos", 9, 5)]);
  const parts = new StaticPartCatalogue(STARTER_PARTS);
  const started = startTacticalMission(
    state,
    "mission-2",
    {
      missionId: "mission-2",
      squadIds: state.roster.squads.map((s) => s.id),
      mechIds: state.roster.mechs.map((m) => m.id),
    },
    {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const sheet = validateLoadout(
          mech.loadout,
          parts,
          MECH_RATING_TUNING,
          UPGRADE_TUNING,
        );
        return sheet.ok ? sheet.value : undefined;
      },
      unitTuning: UNIT_TUNING,
      spawnTuning: SPAWN_TUNING,
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok || !started.value.activeMission)
    throw new Error("fixture must start");
  return started.value.activeMission;
}

describe("overlaysFor", () => {
  it("lists the reachable tiles of a living unit without its own tile, with cover and LOS subsets", () => {
    const m = mission();
    const squad = m.units.find((u) => u.kind === "squad")!;
    const state = overlaysFor(m, squad.id);
    expect(state.moveRange.length).toBeGreaterThan(0);
    expect(
      state.moveRange.some(
        (t) =>
          t.x === squad.pos.x && t.z === squad.pos.z && t.y === squad.pos.y,
      ),
    ).toBe(false);
    const keys = new Set(state.moveRange.map((t) => `${t.x},${t.y},${t.z}`));
    for (const marker of state.cover) {
      expect(
        keys.has(`${marker.tile.x},${marker.tile.y},${marker.tile.z}`),
      ).toBe(true);
      expect(marker.level).toBeGreaterThan(0);
    }
    for (const tile of state.lineOfSight) {
      expect(keys.has(`${tile.x},${tile.y},${tile.z}`)).toBe(true);
    }
  });

  it("is empty for no selection, an unknown unit, or a dead one", () => {
    const m = mission();
    expect(overlaysFor(m, undefined)).toBe(EMPTY_OVERLAYS);
    expect(overlaysFor(m, "ghost")).toBe(EMPTY_OVERLAYS);
    const dead = {
      ...m,
      units: m.units.map((u, i) => (i === 0 ? { ...u, hp: 0 } : u)),
    };
    expect(overlaysFor(dead, m.units[0]!.id)).toBe(EMPTY_OVERLAYS);
  });
});

describe("TacticalOverlays", () => {
  it("draws one instance per tile on the matching layer and clears to zero", () => {
    const overlays = new TacticalOverlays();
    expect(overlays.layers().every((l) => l instanceof InstancedMesh)).toBe(
      true,
    );
    overlays.show({
      moveRange: [
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
        { x: 3, y: 0, z: 1 },
      ],
      cover: [
        { tile: { x: 2, y: 0, z: 1 }, level: 1 },
        { tile: { x: 3, y: 0, z: 1 }, level: 2 },
      ],
      lineOfSight: [{ x: 3, y: 0, z: 1 }],
    });
    expect(overlays.counts()).toEqual({
      range: 3,
      coverLow: 1,
      coverHigh: 1,
      los: 1,
    });
    overlays.clear();
    expect(overlays.counts()).toEqual({
      range: 0,
      coverLow: 0,
      coverHigh: 0,
      los: 0,
    });
    overlays.dispose();
    expect(overlays.root.children).toHaveLength(0);
  });

  it("grows its buffers past the initial capacity", () => {
    const overlays = new TacticalOverlays();
    const many = Array.from({ length: 300 }, (_, i) => ({
      x: i % 20,
      y: 0,
      z: Math.floor(i / 20),
    }));
    overlays.show({ moveRange: many, cover: [], lineOfSight: [] });
    expect(overlays.counts().range).toBe(300);
    overlays.dispose();
  });
});
