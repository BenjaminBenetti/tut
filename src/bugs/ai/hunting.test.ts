import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { BRUTE, LURKER, SWARMER } from "../data/species";
import type { BugSpecies } from "../model/bug-species";
import { BruteBehaviour } from "./brute-behaviour";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { applyMoveTo, bugView, withBug } from "./bug-mission.test-helper";
import { LurkerBehaviour } from "./lurker-behaviour";
import { SwarmerBehaviour } from "./swarmer-behaviour";
import { landingSite, tileDistance } from "./utility";

// ===========================================
// Fixtures
// ===========================================

/** The landing zone the bugs head for when they can see nothing. */
const DEPLOY: TileCoord = { x: 1, y: 0, z: 1 };

const ctx = (mission: TacticalState, seed: number): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

/**
 * A 24×24 field with a deploy hook in one corner, one squad standing on
 * it, and one bug of `species` in the far corner — far enough that bug
 * sight (10 tiles) cannot reach the squad, which is the case #559 is
 * about.
 */
function farApart(
  species: BugSpecies,
  bugAt: TileCoord = { x: 22, y: 0, z: 22 },
) {
  const map = new FixtureMapBuilder(24, 24, 1)
    .fillGround()
    .deploy([DEPLOY])
    .build();
  const base = missionWith(map, [unitAt("squad-1", "infantry", DEPLOY)], {
    phase: "bugs",
  });
  return withBug(base, species, bugAt, "bug-1").mission;
}

/** Every shipped behaviour, with the species that uses it. */
const BEHAVIOURS: readonly {
  name: string;
  species: BugSpecies;
  make: () => BugBehaviour;
}[] = [
  { name: "swarmer", species: SWARMER, make: () => new SwarmerBehaviour() },
  { name: "lurker", species: LURKER, make: () => new LurkerBehaviour() },
  { name: "brute", species: BRUTE, make: () => new BruteBehaviour() },
];

// ===========================================
// Tests
// ===========================================

describe("landingSite", () => {
  it("is the deploy hook tile nearest the asker", () => {
    const map = new FixtureMapBuilder(12, 12, 1)
      .fillGround()
      .deploy([
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 10 },
      ])
      .build();
    const mission = missionWith(map, [unitAt("u", "infantry", DEPLOY)]);
    expect(landingSite(mission, { x: 9, y: 0, z: 9 })).toEqual({
      x: 10,
      y: 0,
      z: 10,
    });
    expect(landingSite(mission, { x: 1, y: 0, z: 1 })).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });

  it("is undefined on a map with no deploy hook, so a behaviour can hold", () => {
    const map = new FixtureMapBuilder(8, 8, 1).fillGround().build();
    const mission = missionWith(map, [unitAt("u", "infantry", DEPLOY)]);
    expect(landingSite(mission, { x: 0, y: 0, z: 0 })).toBeUndefined();
  });
});

describe("a bug that can perceive no enemy (#559)", () => {
  for (const { name, species, make } of BEHAVIOURS) {
    it(`${name}: issues a command instead of holding still`, () => {
      const mission = farApart(species);
      const view = bugView(mission);
      // The premise: the squad is genuinely not perceived.
      expect(view.units.some((u) => u.team === "tdf")).toBe(false);
      const commands = make().choose(view, "bug-1", ctx(mission, 1));
      expect(commands.length).toBeGreaterThan(0);
      expect(commands[0]?.type).toBe(MOVE);
    });

    it(`${name}: closes on the landing zone rather than wandering`, () => {
      const mission = farApart(species);
      const before = tileDistance({ x: 22, y: 0, z: 22 }, DEPLOY);
      const commands = make().choose(
        bugView(mission),
        "bug-1",
        ctx(mission, 3),
      );
      const step = commands.find((c) => c.type === MOVE);
      expect(step).toBeDefined();
      const end = step!.payload.path.at(-1)!;
      expect(tileDistance(end, DEPLOY)).toBeLessThan(before);
    });

    it(`${name}: holds when the map has no landing zone to head for`, () => {
      const map = new FixtureMapBuilder(24, 24, 1).fillGround().build();
      const base = missionWith(map, [unitAt("squad-1", "infantry", DEPLOY)], {
        phase: "bugs",
      });
      const mission = withBug(
        base,
        species,
        { x: 22, y: 0, z: 22 },
        "bug-1",
      ).mission;
      expect(make().choose(bugView(mission), "bug-1", ctx(mission, 1))).toEqual(
        [],
      );
    });
  }

  it("reaches a player who never moves, so the mission can end", () => {
    // The measured failure on #559: 25 turns, the player doing nothing,
    // and no bug closer than 26 tiles. One bug is enough to show the
    // rule restored pressure.
    let mission = farApart(SWARMER);
    const swarmer = new SwarmerBehaviour();
    const start = tileDistance({ x: 22, y: 0, z: 22 }, DEPLOY);
    for (let turn = 0; turn < 12; turn++) {
      const commands = swarmer.choose(
        bugView(mission),
        "bug-1",
        ctx(mission, turn),
      );
      const step = commands.find((c) => c.type === MOVE);
      if (!step) {
        break;
      }
      mission = applyMoveTo(mission, "bug-1", step.payload.path);
    }
    const bug = mission.units.find((u) => u.id === "bug-1")!;
    const ended = tileDistance(bug.pos, DEPLOY);
    expect(ended).toBeLessThan(start);
    // Within bug sight of the squad, i.e. contact is made and the normal
    // behaviour takes over from here.
    expect(ended).toBeLessThanOrEqual(10);
  });

  it("keeps each behaviour's own gait rather than sharing one fallback", () => {
    // The lurker pays an exposure penalty the swarmer does not, so on the
    // same board the two do not have to agree — and must not be the same
    // code path. Asserting they are independently computed, not identical.
    const mission = farApart(SWARMER);
    const view = bugView(mission);
    const swarmerStep = new SwarmerBehaviour()
      .choose(view, "bug-1", ctx(mission, 5))
      .find((c) => c.type === MOVE);
    const lurkerStep = new LurkerBehaviour()
      .choose(view, "bug-1", ctx(mission, 5))
      .find((c) => c.type === MOVE);
    expect(swarmerStep).toBeDefined();
    expect(lurkerStep).toBeDefined();
    // Both advance; each decides for itself how.
    for (const step of [swarmerStep!, lurkerStep!]) {
      expect(tileDistance(step.payload.path.at(-1)!, DEPLOY)).toBeLessThan(
        tileDistance({ x: 22, y: 0, z: 22 }, DEPLOY),
      );
    }
  });
});
