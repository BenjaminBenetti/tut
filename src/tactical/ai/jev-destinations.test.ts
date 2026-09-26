import { describe, expect, it } from "vitest";
import { TileIndex } from "../../mapgen/service/tile-index";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import type { TacticalState } from "../model/tactical-state";
import { SHIPPED_EQUIPMENT } from "../repository/equipment-catalogue";
import { createHarvestHandler } from "../service/harvest-service";
import { createMoveHandler } from "../service/move-handler";
import { createExtractHandler } from "../service/objective-service";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  twoFloorBuilding,
  unitAt,
} from "../service/tactical-fixtures.test-helper";
import { DEFEND_GENERATORS_OBJECTIVE } from "../service/objectives/defend-generators-objective";
import { OBJECTIVE_RULES } from "../service/objectives/objective-rules";
import {
  jevDestinations,
  jevObjectives,
  type JevDestinationSources,
} from "./jev-destinations";
import { jevPerception } from "./jev-observation";
import { captureJev, jevChoicePage } from "./jev-request";

const rules = {
  handlers: {
    "tactical:harvest-carcass": createHarvestHandler(OBJECTIVE_TUNING),
    "tactical:extract": createExtractHandler(OBJECTIVE_TUNING),
  },
  combat: COMBAT_TUNING,
  equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
};

/** Give the faction one of every destination source without revealing the radar target. */
function fixture(): TacticalState {
  const base = missionWith(openField().build(), [
    unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
    unitAt("ally", "infantry", { x: 6, y: 0, z: 3 }),
    unitAt("secret-enemy", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
  ]);
  const visible = [new TileIndex(base.map).keyOf({ x: 5, y: 0, z: 1 })];
  return {
    ...base,
    extraction: [{ x: 7, y: 0, z: 2 }],
    carcasses: [
      {
        id: "tech",
        pos: { x: 5, y: 0, z: 1 },
        techPoints: 17,
        harvested: false,
      },
    ],
    objectives: [
      {
        id: "objective",
        kind: "destroy-spawner",
        targetId: "nest",
        complete: false,
      },
    ],
    spawners: [
      {
        id: "nest",
        pos: { x: 7, y: 0, z: 0 },
        hp: 10,
        destroyed: false,
        hatchRadius: 3,
        timer: 3,
      },
    ],
    radars: [
      {
        id: "scanner",
        team: "tdf",
        pos: { x: 4, y: 0, z: 4 },
        range: 10,
        turnsLeft: 3,
      },
    ],
    vision: {
      ...base.vision,
      tdf: {
        visible,
        explored: visible,
        spotted: [],
        lastSeen: { historical: { x: 6, y: 0, z: 6 } },
      },
    },
  };
}

describe("Jev destination coverage", () => {
  it("offers a reachable movement choice for every known destination source", () => {
    const mission = fixture();
    const sources = jevDestinations(
      mission,
      jevPerception(mission, mission.units[0]!),
      mission.units[0]!,
    );
    // A new source must get both a provider and a representative coverage case.
    const expected = {
      entities: "move_to_entity:ally",
      objectives: "move_to_objective:objective",
      extraction: "move_to_extraction",
      visible_carcasses: "move_to_carcass:tech",
      radar_contacts: "investigate_radar:7:0:7",
      last_seen: "investigate_last_seen:historical",
    } satisfies Record<keyof JevDestinationSources, string>;
    const snapshot = captureJev(mission, "self", rules);
    const choices = jevChoicePage(
      snapshot,
      snapshot.candidates.filter((candidate) => candidate.movement),
    ).request.questions.action!.criteria;
    for (const key of Object.keys(
      expected,
    ) as (keyof JevDestinationSources)[]) {
      expect(sources[key].length, key).toBeGreaterThan(0);
      expect(choices, key).toHaveProperty(expected[key]);
      const command = snapshot.candidates.find(
        (candidate) => candidate.id === expected[key],
      )!.command!;
      if (command.type !== "tactical:move")
        throw new Error("Expected movement");
      expect(
        createMoveHandler()(mission, command, ctxWith(riggedRng(true))).ok,
        key,
      ).toBe(true);
    }
  });

  it("reaches harvesting range, offers Harvest, and removes the destination once stripped", () => {
    let mission = fixture();
    for (let step = 0; step < 8; step++) {
      const target = captureJev(mission, "self", rules).candidates.find(
        (candidate) => candidate.id === "move_to_carcass:tech",
      );
      if (!target) break;
      if (target.command?.type !== "tactical:move")
        throw new Error("Expected movement");
      const moved = createMoveHandler()(
        mission,
        target.command,
        ctxWith(riggedRng(true)),
      );
      if (!moved.ok) throw new Error(JSON.stringify(moved.error));
      mission = {
        ...moved.value.state,
        units: moved.value.state.units.map((unit) => ({ ...unit, ap: 2 })),
      };
    }
    const snapshot = captureJev(mission, "self", rules);
    expect(
      snapshot.candidates.some(
        (candidate) => candidate.id === "move_to_carcass:tech",
      ),
    ).toBe(false);
    const harvest = snapshot.candidates.find(
      (candidate) => candidate.command?.type === "tactical:harvest-carcass",
    )!.command!;
    if (harvest.type !== "tactical:harvest-carcass")
      throw new Error("Expected harvest");
    const applied = rules.handlers[harvest.type](
      mission,
      harvest,
      ctxWith(riggedRng(true)),
    );
    if (!applied.ok) throw new Error(JSON.stringify(applied.error));
    expect(applied.value.events[0]?.payload).toMatchObject({ techPoints: 17 });
    expect(
      captureJev(applied.value.state, "self", rules).candidates.some(
        (candidate) => candidate.id === "move_to_carcass:tech",
      ),
    ).toBe(false);
  });

  it.each(["mech", "bug", "hidden", "harvested", "unreachable"] as const)(
    "omits unusable carcass movement: %s",
    (condition) => {
      const base = fixture();
      const actor =
        condition === "mech"
          ? unitAt("self", "mech", { x: 0, y: 0, z: 0 })
          : condition === "bug"
            ? unitAt("self", "infantry", { x: 0, y: 0, z: 0 }, { team: "bugs" })
            : base.units[0]!;
      const mission: TacticalState = {
        ...base,
        phase: condition === "bug" ? "bugs" : "player",
        units: [actor, ...base.units.slice(1)],
        vision:
          condition === "hidden"
            ? { ...base.vision, tdf: { ...base.vision.tdf, visible: [] } }
            : { tdf: base.vision.tdf, bugs: base.vision.tdf },
        carcasses: base.carcasses.map((carcass) => ({
          ...carcass,
          harvested: condition === "harvested",
        })),
        map:
          condition === "unreachable"
            ? {
                ...base.map,
                tiles: base.map.tiles.map((tile) =>
                  tile.x === 3 ? { ...tile, pass: 0 } : tile,
                ),
              }
            : base.map,
      };
      expect(
        captureJev(mission, "self", rules).candidates.some(
          (candidate) => candidate.id === "move_to_carcass:tech",
        ),
      ).toBe(false);
    },
  );

  it("uses the injected harvest range instead of assuming adjacency", () => {
    const base = fixture();
    const mission = {
      ...base,
      units: [
        { ...base.units[0]!, pos: { x: 3, y: 0, z: 1 } },
        ...base.units.slice(1),
      ],
    };
    expect(
      captureJev(mission, "self", rules).candidates.some(
        (candidate) => candidate.id === "move_to_carcass:tech",
      ),
    ).toBe(true);
    const widerRules = {
      ...rules,
      handlers: {
        ...rules.handlers,
        "tactical:harvest-carcass": createHarvestHandler({
          ...OBJECTIVE_TUNING,
          interactRange: 2,
        }),
      },
    };
    const snapshot = captureJev(mission, "self", widerRules);
    expect(
      snapshot.candidates.some(
        (candidate) => candidate.id === "move_to_carcass:tech",
      ),
    ).toBe(false);
    expect(
      snapshot.candidates.some(
        (candidate) => candidate.category === "harvest-carcass",
      ),
    ).toBe(true);
  });

  it("keeps radar targets anonymous and historical positions independent of hidden current state", () => {
    const mission = fixture();
    const initial = captureJev(mission, "self", rules);
    const changed = captureJev(
      {
        ...mission,
        units: mission.units.map((unit) =>
          unit.team === "bugs"
            ? { ...unit, id: "other-secret", hp: 1, maxHp: 300 }
            : unit,
        ),
      },
      "self",
      rules,
    );
    expect(initial).toEqual(changed);
    expect(JSON.stringify(initial)).not.toContain("secret-enemy");
    const radar = initial.candidates.find(
      (candidate) => candidate.id === "investigate_radar:7:0:7",
    )!;
    expect(radar.movement?.targetId).toBeUndefined();
    expect(radar.description).toContain("Position only");
    expect(
      initial.candidates.find(
        (candidate) => candidate.id === "investigate_last_seen:historical",
      )?.description,
    ).toContain("historical position");
    expect(
      initial.candidates.some((candidate) => candidate.category === "attack"),
    ).toBe(false);
  });

  it("drops expired radar and cleared or currently visible historical sightings", () => {
    const base = fixture();
    const position = base.vision.tdf.lastSeen.historical!;
    for (const vision of [
      {
        ...base.vision.tdf,
        visible: [
          ...base.vision.tdf.visible,
          new TileIndex(base.map).keyOf(position),
        ],
      },
      { ...base.vision.tdf, spotted: ["historical"] },
    ]) {
      const snapshot = captureJev(
        {
          ...base,
          radars: base.radars.map((radar) => ({ ...radar, turnsLeft: 0 })),
          vision: { ...base.vision, tdf: vision },
        },
        "self",
        rules,
      );
      expect(snapshot.state.radar_contacts).toEqual([]);
      expect(snapshot.state.last_seen).toEqual([]);
      expect(
        snapshot.candidates.some((candidate) =>
          candidate.id.startsWith("investigate_"),
        ),
      ).toBe(false);
    }
  });

  it("takes the stairs to investigate a radar contact on another floor without revealing its identity", () => {
    const base = missionWith(twoFloorBuilding(), [
      unitAt("self", "infantry", { x: 5, y: 0, z: 6 }),
      unitAt(
        "secret-upstairs",
        "infantry",
        { x: 6, y: 2, z: 5 },
        { team: "bugs" },
      ),
    ]);
    let mission: TacticalState = {
      ...base,
      radars: [
        {
          id: "radar",
          team: "tdf",
          pos: { x: 5, y: 0, z: 4 },
          range: 10,
          turnsLeft: 3,
        },
      ],
    };
    for (let step = 0; step < 12; step++) {
      const snapshot = captureJev(mission, "self", rules);
      expect(JSON.stringify(snapshot)).not.toContain("secret-upstairs");
      const target = snapshot.candidates.find(
        (candidate) => candidate.id === "investigate_radar:6:2:5",
      );
      if (!target) break;
      if (target.command?.type !== "tactical:move")
        throw new Error("Expected movement");
      const moved = createMoveHandler()(
        mission,
        target.command,
        ctxWith(riggedRng(true)),
      );
      if (!moved.ok) throw new Error(JSON.stringify(moved.error));
      mission = {
        ...moved.value.state,
        units: moved.value.state.units.map((unit) => ({ ...unit, ap: 2 })),
        vision: base.vision,
      };
    }
    expect(mission.units[0]!.pos.y).toBe(2);
    expect(mission.units[0]!.pos).not.toEqual(mission.units[1]!.pos);
  });
});

describe("jevObjectives (ADR 0013 §2.3)", () => {
  /** A nest at (4,0,4) with its objective, and a defence of two generators. */
  function objectives(failedNest?: boolean): TacticalState {
    return missionWith(
      openField().build(),
      [unitAt("self", "infantry", { x: 0, y: 0, z: 0 })],
      {
        spawners: [
          {
            id: "nest",
            pos: { x: 4, y: 0, z: 4 },
            hatchRadius: 3,
            hp: 20,
            timer: 3,
            destroyed: false,
          },
        ],
        objectives: [
          {
            id: "objective-1",
            kind: "destroy-spawner",
            targetId: "nest",
            complete: false,
            ...(failedNest === undefined ? {} : { failed: failedNest }),
          },
          {
            id: "objective-2",
            kind: "defend-generators",
            installation: "sensor-array",
            targetIds: ["gen-1", "gen-2"],
            complete: false,
            failed: false,
          },
        ],
      },
    );
  }

  it("says where each objective is by its kind's rules, with failed only where recorded", () => {
    expect(jevObjectives(objectives())).toEqual([
      {
        id: "objective-1",
        kind: "destroy-spawner",
        complete: false,
        position: { x: 4, y: 0, z: 4 },
      },
      {
        id: "objective-2",
        kind: "defend-generators",
        complete: false,
        target_ids: ["gen-1", "gen-2"],
        failed: false,
      },
    ]);
    expect("failed" in (jevObjectives(objectives())[0] ?? {})).toBe(false);
  });

  it("reports a spawner objective a deadline has failed", () => {
    expect(jevObjectives(objectives(true))[0]).toMatchObject({
      id: "objective-1",
      failed: true,
    });
  });

  it("uses a substituted destination rule", () => {
    const [, defence] = jevObjectives(objectives(), {
      ...OBJECTIVE_RULES,
      "defend-generators": {
        ...DEFEND_GENERATORS_OBJECTIVE,
        destination: () => ({ position: { x: 9, y: 0, z: 9 } }),
      },
    });
    expect(defence).toEqual({
      id: "objective-2",
      kind: "defend-generators",
      complete: false,
      position: { x: 9, y: 0, z: 9 },
      failed: false,
    });
  });
});
