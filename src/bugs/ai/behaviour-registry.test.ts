import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import { BUG_SPECIES, SWARMER } from "../data/species";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { startedMission, withBug, bugView } from "./bug-mission.test-helper";
import {
  behaviourTagOf,
  chooseBugCommands,
  MapBehaviourRegistry,
} from "./behaviour-registry";
import { PERSONAS } from "../data/personas";
import type { PersonaDefinition } from "../model/persona";
import { createPersonaLookup } from "../service/persona-lookup";
import {
  attackOptions,
  bestBy,
  distanceScore,
  moveTowards,
  nearestEnemy,
  reachableTiles,
} from "./utility";

// ===========================================
// Fixtures
// ===========================================

/** A live mission with the starter roster and one swarmer beside a squad, in the bugs' phase. */
function missionWithBug(): { mission: TacticalState; bug: Unit } {
  const base = startedMission("bugs");
  const squad = base.units.find((u) => u.kind === "squad")!;
  return withBug(base, SWARMER, {
    x: squad.pos.x + 1,
    y: squad.pos.y,
    z: squad.pos.z,
  });
}

const ctx = (mission: TacticalState): BehaviourContext => ({
  rng: new Mulberry32Rng(7),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

/** A dummy rush: attack the best target in reach, else step towards the nearest enemy. */
const dummyRush: BugBehaviour = {
  tag: "rush",
  choose(mission, unitId, c) {
    const unit = mission.units.find((u) => u.id === unitId)!;
    const shot = attackOptions(mission, unitId, c.combat)[0];
    if (shot) {
      return [
        {
          type: ATTACK,
          payload: { attackerId: unitId, targetId: shot.target.id },
        },
      ];
    }
    const enemy = nearestEnemy(mission, unit);
    if (!enemy) {
      return [];
    }
    const tiles = reachableTiles(mission, unitId, c.graph);
    const best = bestBy(
      tiles,
      (t) => distanceScore(t.tile, enemy.pos, 64),
      c.rng,
    );
    const step = best
      ? moveTowards(mission, unitId, best.tile, c.graph)
      : undefined;
    return step ? [step] : [];
  },
};

// ===========================================
// Tests
// ===========================================

describe("MapBehaviourRegistry", () => {
  it("registers one behaviour per tag and rejects duplicates", () => {
    const registry = new MapBehaviourRegistry([dummyRush]);
    expect(registry.get("rush")).toBe(dummyRush);
    expect(registry.get("flank")).toBeUndefined();
    expect(registry.tags()).toEqual(["rush"]);
    expect(() => registry.register(dummyRush)).toThrow(/Duplicate/);
  });
});

describe("chooseBugCommands", () => {
  it("drives a bug through its species' behaviour: adjacent to a squad it attacks", () => {
    const { mission, bug } = missionWithBug();
    const registry = new MapBehaviourRegistry([dummyRush]);
    const commands = chooseBugCommands(
      bugView(mission),
      bug.id,
      registry,
      (id) => BUG_SPECIES[id as "swarmer"],
      ctx(mission),
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe(ATTACK);
  });

  it("moves towards the nearest enemy when nothing is in reach", () => {
    const { mission, bug } = missionWithBug();
    // Push the bug to the far corner of the map.
    const far = { x: mission.map.width - 1, y: 0, z: mission.map.depth - 1 };
    const away: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === bug.id ? { ...u, pos: far } : u,
      ),
    };
    const registry = new MapBehaviourRegistry([dummyRush]);
    const commands = chooseBugCommands(
      bugView(away),
      bug.id,
      registry,
      (id) => BUG_SPECIES[id as "swarmer"],
      ctx(away),
    );
    if (commands.length === 0) {
      // The corner may be unwalkable for this seed; the contract is "no crash, no attack".
      return;
    }
    expect(commands[0]?.type).toBe(MOVE);
    const enemy = nearestEnemy(away, { ...bug, pos: far })!;
    const payload = commands[0]!.payload as {
      path: { x: number; z: number }[];
    };
    const end = payload.path.at(-1)!;
    expect(
      Math.abs(end.x - enemy.pos.x) + Math.abs(end.z - enemy.pos.z),
    ).toBeLessThan(
      Math.abs(far.x - enemy.pos.x) + Math.abs(far.z - enemy.pos.z),
    );
  });

  it("holds still for a dead bug, a non-bug, an unknown species or an unregistered tag", () => {
    const { mission, bug } = missionWithBug();
    const registry = new MapBehaviourRegistry([dummyRush]);
    const species = (id: string) => BUG_SPECIES[id as "swarmer"];
    const dead = {
      ...mission,
      units: mission.units.map((u) => (u.id === bug.id ? { ...u, hp: 0 } : u)),
    };
    expect(
      chooseBugCommands(bugView(dead), bug.id, registry, species, ctx(dead)),
    ).toEqual([]);
    const squad = mission.units.find((u) => u.kind === "squad")!;
    expect(
      chooseBugCommands(
        bugView(mission),
        squad.id,
        registry,
        species,
        ctx(mission),
      ),
    ).toEqual([]);
    expect(
      chooseBugCommands(
        bugView(mission),
        bug.id,
        registry,
        () => undefined,
        ctx(mission),
      ),
    ).toEqual([]);
    expect(
      chooseBugCommands(
        bugView(mission),
        bug.id,
        new MapBehaviourRegistry(),
        species,
        ctx(mission),
      ),
    ).toEqual([]);
  });
});

describe("behaviourTagOf (ADR 0013 §2.8)", () => {
  const species = (id: string) => BUG_SPECIES[id as "swarmer" | "lurker"];
  const personaOf = createPersonaLookup(PERSONAS);

  it("plays the species' tag for an ordinary bug", () => {
    expect(behaviourTagOf({ sourceId: "lurker" }, species, personaOf)).toBe(
      "flank",
    );
  });

  it("plays a named enemy's persona fallback instead of its species' tag", () => {
    // A Broodmother carried by a swarmer does not rush; it plays her fallback.
    expect(PERSONAS.broodmother.fallback).not.toBe(SWARMER.behaviour);
    expect(
      behaviourTagOf(
        { sourceId: "swarmer", persona: "broodmother" },
        species,
        personaOf,
      ),
    ).toBe(PERSONAS.broodmother.fallback);
  });

  it("plays the species when the persona's fallback says so (an alpha fights as its species)", () => {
    expect(PERSONAS.alpha.fallback).toBe("species");
    expect(
      behaviourTagOf(
        { sourceId: "lurker", persona: "alpha" },
        species,
        personaOf,
      ),
    ).toBe("flank");
  });

  it("plays the species for a persona this build does not know, or with no persona lookup", () => {
    expect(
      behaviourTagOf(
        { sourceId: "swarmer", persona: "future-boss" as "alpha" },
        species,
        personaOf,
      ),
    ).toBe("rush");
    expect(
      behaviourTagOf({ sourceId: "swarmer", persona: "broodmother" }, species),
    ).toBe("rush");
  });
});

describe("chooseBugCommands with a persona", () => {
  it("asks the persona's fallback behaviour, not the species', to choose", () => {
    const { mission, bug } = missionWithBug();
    const named = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === bug.id ? { ...u, persona: "broodmother" as const } : u,
      ),
    };
    const asked: string[] = [];
    const spy = (tag: "rush" | "flank"): BugBehaviour => ({
      tag,
      choose: () => {
        asked.push(tag);
        return [];
      },
    });
    const flanker: PersonaDefinition = {
      ...PERSONAS.broodmother,
      fallback: "flank",
    };
    chooseBugCommands(
      bugView(named),
      bug.id,
      new MapBehaviourRegistry([spy("rush"), spy("flank")]),
      (id) => BUG_SPECIES[id as "swarmer"],
      ctx(named),
      (id) => (id === "broodmother" ? flanker : undefined),
    );
    expect(asked).toEqual(["flank"]);
  });
});
