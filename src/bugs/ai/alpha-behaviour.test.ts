import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import {
  ATTACK,
  attack,
  attackTile,
} from "../../tactical/model/attack-command";
import { burrow } from "../../tactical/model/burrow-command";
import { move } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { BUG_SPECIES, SPITTER } from "../data/species";
import { AlphaBehaviour, focusFire } from "./alpha-behaviour";
import { MapBehaviourRegistry } from "./behaviour-registry";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { bugView, withBug } from "./bug-mission.test-helper";
import { fieldMap } from "../service/broodmother.test-helper";
import { SpitterBehaviour } from "./spitter-behaviour";

// ===========================================
// Fixtures
// ===========================================

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** Where the alpha spitter stands. */
const ALPHA_POS = at(8, 8);

/** A decision context over a fixed seed. */
const CTX: BehaviourContext = {
  rng: new Mulberry32Rng(7),
  combat: COMBAT_TUNING,
};

/**
 * A 20×20 field with an alpha spitter (range 6) at (8, 8) and the squads
 * given, vision computed. `hidden` names squads the swarm has not
 * spotted: they stand in reach but are struck from its vision, as a
 * squad nobody has seen would be.
 */
function field(
  squads: readonly Unit[],
  hidden: readonly string[] = [],
): { mission: TacticalState; alpha: Unit } {
  const base = missionWith(fieldMap(20, 20).build(), squads, {
    phase: "bugs",
  });
  const { mission, bug } = withBug(base, SPITTER, ALPHA_POS, "alpha-1");
  const alpha: Unit = { ...bug, persona: "alpha", name: "Grinder" };
  const bugs = mission.vision.bugs;
  if (bugs === undefined) {
    throw new Error("the swarm has no vision");
  }
  return {
    alpha,
    mission: {
      ...mission,
      units: mission.units.map((unit) => (unit.id === alpha.id ? alpha : unit)),
      vision: {
        ...mission.vision,
        bugs: {
          ...bugs,
          spotted: bugs.spotted.filter((id) => !hidden.includes(id)),
        },
      },
    },
  };
}

/** A squad of `hp` at (x, z). */
function squadAt(id: string, x: number, z: number, hp: number): Unit {
  return unitAt(id, "infantry", at(x, z), { hp });
}

/** A species behaviour that always answers `commands`. */
function scripted(commands: readonly TacticalCommand[]): BugBehaviour {
  return { tag: SPITTER.behaviour, choose: () => commands };
}

/** The alpha over a registry holding only the scripted spitter behaviour. */
function alphaOver(commands: readonly TacticalCommand[]): AlphaBehaviour {
  const registry = new MapBehaviourRegistry([scripted(commands)]);
  return new AlphaBehaviour(registry, (id) =>
    id === SPITTER.id ? SPITTER : undefined,
  );
}

/** The target of every unit attack among `commands`. */
function targets(commands: readonly TacticalCommand[]): (string | undefined)[] {
  return commands.flatMap((command) =>
    command.type === ATTACK ? [command.payload.targetId] : [],
  );
}

// ===========================================
// Tests
// ===========================================

describe("AlphaBehaviour (#1179, campaign arc §8, §9)", () => {
  it("turns its species' attack on the weakest enemy it can see and hit", () => {
    const { mission, alpha } = field([
      squadAt("strong", 8, 12, 10),
      squadAt("weak", 12, 8, 3),
    ]);
    const chosen = alphaOver([attack(alpha.id, "strong", "primary")]).choose(
      bugView(mission),
      alpha.id,
      CTX,
    );
    expect(chosen).toEqual([attack(alpha.id, "weak", "primary")]);
  });

  it("never picks a squad the swarm has not spotted, however weak", () => {
    // The hidden squad is in range and in the open, with 1 hit point:
    // only the swarm's vision keeps it out of the running.
    const { mission, alpha } = field(
      [
        squadAt("strong", 8, 12, 10),
        squadAt("weak", 12, 8, 3),
        squadAt("hidden", 4, 8, 1),
      ],
      ["hidden"],
    );
    const chosen = alphaOver([attack(alpha.id, "strong")]).choose(
      bugView(mission),
      alpha.id,
      CTX,
    );
    expect(targets(chosen)).toEqual(["weak"]);
  });

  it("keeps the species' pick when nothing in reach is strictly weaker", () => {
    const { mission, alpha } = field([
      squadAt("first", 8, 12, 4),
      squadAt("second", 12, 8, 4),
      // Weaker, but out of its range of 6.
      squadAt("far", 8, 17, 1),
    ]);
    // Whichever of the tied pair the species chose stands: a tie is not
    // weaker, so the alpha never trades one 4 for another.
    for (const pick of ["first", "second"]) {
      const commands = [attack(alpha.id, pick)];
      expect(
        alphaOver(commands).choose(bugView(mission), alpha.id, CTX),
      ).toEqual(commands);
    }
  });

  it("judges an attack from where the moves before it leave the alpha", () => {
    // The weak squad is 7 away at the start, in reach after one step east.
    const { mission, alpha } = field([
      squadAt("strong", 8, 12, 10),
      squadAt("weak", 15, 8, 2),
    ]);
    const view = bugView(mission);
    const standing = alphaOver([attack(alpha.id, "strong")]).choose(
      view,
      alpha.id,
      CTX,
    );
    expect(targets(standing)).toEqual(["strong"]);
    const stepped = alphaOver([
      move(alpha.id, [at(9, 8)]),
      attack(alpha.id, "strong"),
    ]).choose(view, alpha.id, CTX);
    expect(targets(stepped)).toEqual(["weak"]);
  });

  it("leaves a shot at a tile, and anything after a command it cannot follow, as chosen", () => {
    const { mission, alpha } = field([
      squadAt("strong", 8, 12, 10),
      squadAt("weak", 12, 8, 3),
    ]);
    const tileShot = attackTile(alpha.id, at(8, 12));
    expect(focusFire(mission, alpha, [tileShot], COMBAT_TUNING)).toEqual([
      tileShot,
    ]);
    const after = focusFire(
      mission,
      alpha,
      [burrow(alpha.id), attack(alpha.id, "strong")],
      COMBAT_TUNING,
    );
    expect(targets(after)).toEqual(["strong"]);
  });

  it("does nothing when dead or when its species has no behaviour", () => {
    const { mission, alpha } = field([squadAt("strong", 8, 12, 10)]);
    const dead: TacticalState = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === alpha.id ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(
      alphaOver([attack(alpha.id, "strong")]).choose(
        bugView(dead),
        alpha.id,
        CTX,
      ),
    ).toEqual([]);
    const bare = new AlphaBehaviour(new MapBehaviourRegistry(), (id) =>
      id === SPITTER.id ? SPITTER : undefined,
    );
    expect(bare.choose(bugView(mission), alpha.id, CTX)).toEqual([]);
  });

  it("plays the real spitter's choice with the focus added", () => {
    const { mission, alpha } = field([
      squadAt("strong", 8, 12, 10),
      squadAt("weak", 12, 8, 3),
    ]);
    const registry = new MapBehaviourRegistry([new SpitterBehaviour()]);
    const speciesOf = (id: string) =>
      Object.values(BUG_SPECIES).find((species) => species.id === id);
    const view = bugView(mission);
    const species = registry
      .get(SPITTER.behaviour)
      ?.choose(view, alpha.id, { ...CTX, rng: new Mulberry32Rng(3) });
    const crowned = new AlphaBehaviour(registry, speciesOf).choose(
      view,
      alpha.id,
      { ...CTX, rng: new Mulberry32Rng(3) },
    );
    // The same moves in the same order; its attacks on units go to the
    // weakest it can reach.
    expect(crowned.map((command) => command.type)).toEqual(
      species?.map((command) => command.type),
    );
    expect(targets(species ?? [])).not.toEqual([]);
    expect(targets(crowned)).toEqual(targets(crowned).map(() => "weak"));
    expect(targets(crowned)).not.toEqual([]);
  });
});
