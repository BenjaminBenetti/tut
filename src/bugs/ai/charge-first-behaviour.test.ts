import { describe, expect, it } from "vitest";

import type { Rng } from "../../core/model/rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { BURROW_TUNING } from "../../tactical/data/burrow-tuning";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { BREACHING_CHARGE } from "../../tactical/data/equipment";
import { ATTACK, attack } from "../../tactical/model/attack-command";
import type { PlacedCharge } from "../../tactical/model/equipment";
import { MOVE } from "../../tactical/model/move-command";
import { SURFACE } from "../../tactical/model/surface-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../tactical/model/tactical-state";
import { TUNNEL_CHARGE_DISARMED } from "../../tactical/model/tunnel-charge-disarmed-event";
import type { TunnelMouth } from "../../tactical/model/tunnel-mouth";
import type { Unit } from "../../tactical/model/unit";
import { PRIMARY_WEAPON_ID } from "../../tactical/model/unit-weapon";
import { createAttackHandler } from "../../tactical/service/combat-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import { createSurfaceHandler } from "../../tactical/service/surface-handler";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import {
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { createOverwatchReaction } from "../../tactical/service/turn-service";
import { BRUTE, BURROWER, SPITTER, SWARMER } from "../data/species";
import { fieldMap } from "../service/broodmother.test-helper";
import { MapBehaviourRegistry } from "./behaviour-registry";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { bugView, withBug } from "./bug-mission.test-helper";
import { createBugPhaseRunner } from "./bug-phase-runner";
import {
  ChargeFirstBehaviour,
  ChargeFirstLookup,
  pullCharge,
} from "./charge-first-behaviour";
import { SwarmerBehaviour } from "./swarmer-behaviour";

// ===========================================
// Fixtures
// ===========================================

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** An Rng that fails the test on any draw at all. */
const NO_DRAWS: Rng = {
  next: () => {
    throw new Error("drew next");
  },
  nextInt: () => {
    throw new Error("drew nextInt");
  },
  pick: () => {
    throw new Error("drew pick");
  },
  chance: () => {
    throw new Error("drew chance");
  },
  pickWeighted: () => {
    throw new Error("drew pickWeighted");
  },
  shuffle: () => {
    throw new Error("drew shuffle");
  },
  fork: () => NO_DRAWS,
  getState: () => ({ algorithm: "none", seed: 0, state: 0 }),
};

/** A decision context that may not draw. */
const CTX: BehaviourContext = { rng: NO_DRAWS, combat: COMBAT_TUNING };

/** What the stand-in species plays: one sentinel command. */
const SPECIES_PLAY: readonly TacticalCommand[] = [attack("nobody", "anyone")];

/** A species that always plays `SPECIES_PLAY`, drawing nothing. */
const STAND_IN: BugBehaviour = {
  tag: "rush",
  choose: () => SPECIES_PLAY,
};

/** A 2 × 2 mouth at (x, z), its charge tile the corner. */
function mouthAt(
  id: string,
  x: number,
  z: number,
  charged: boolean,
): TunnelMouth {
  return {
    id,
    pos: at(x, z),
    tiles: [at(x, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1)],
    ...(charged ? { chargeId: `${id}-charge`, chargeHitsLeft: 1 } : {}),
  };
}

/** The charge burning on `mouth`. */
function chargeOn(mouth: TunnelMouth): PlacedCharge {
  return {
    id: `${mouth.id}-charge`,
    ownerId: "s",
    equipmentId: BREACHING_CHARGE.id,
    tile: mouth.pos,
    detonatesOnTurn: 8,
  };
}

/**
 * A 20 × 20 field in the bugs' phase: a squad at (10, 4), mouths as
 * given (charged ones burning), and one bug of `species` at `pos`.
 */
function field(
  species: typeof SWARMER,
  pos: TileCoord,
  mouths: readonly TunnelMouth[],
  squadAt: TileCoord = at(10, 4),
): { mission: TacticalState; bug: Unit } {
  const seal: SealTunnelsObjective = {
    id: "objective-1",
    kind: "seal-tunnels",
    mouthIds: mouths.map((mouth) => mouth.id),
    complete: false,
  };
  const base: TacticalState = {
    ...missionWith(
      fieldMap(20, 20).build(),
      [unitAt("s", "infantry", squadAt)],
      {
        phase: "bugs",
        turn: 5,
        objectives: [seal],
      },
    ),
    tunnelMouths: mouths,
    charges: mouths.filter((m) => m.chargeId !== undefined).map(chargeOn),
  };
  return withBug(base, species, pos, "b");
}

/** The decorated stand-in's choice for the bug. */
function decided(mission: TacticalState): readonly TacticalCommand[] {
  return new ChargeFirstBehaviour(STAND_IN).choose(bugView(mission), "b", CTX);
}

// ===========================================
// Tests
// ===========================================

describe("ChargeFirstBehaviour (campaign arc §6.7, Ben's rule of 2026-09-28)", () => {
  it("plays the species' own commands when no charge burns, drawing nothing", () => {
    const { mission } = field(SWARMER, at(9, 4), [
      mouthAt("tunnel-1", 10, 10, false),
    ]);
    expect(decided(mission)).toBe(SPECIES_PLAY);
    // And on a mission with no mouths at all.
    expect(decided({ ...mission, tunnelMouths: undefined })).toBe(SPECIES_PLAY);
  });

  it("pulls a charge in reach before biting a squad also in reach", () => {
    // The swarmer at (9, 4) stands beside the squad (10, 4) and the
    // charge on (9, 5) both.
    const { mission } = field(
      SWARMER,
      at(9, 4),
      [mouthAt("tunnel-1", 9, 5, true)],
      at(10, 4),
    );
    expect(decided(mission)).toEqual([
      attack("b", "tunnel-1-charge", PRIMARY_WEAPON_ID),
    ]);
  });

  it("walks to the charge by the fewest steps and pulls it, when it can still bite", () => {
    const { mission } = field(SWARMER, at(9, 2), [
      mouthAt("tunnel-1", 9, 8, true),
    ]);
    const commands = decided(mission);
    expect(commands.map((c) => c.type)).toEqual([MOVE, ATTACK]);
    const walk = commands[0];
    const end = walk?.type === MOVE ? walk.payload.path.at(-1) : undefined;
    // Five steps south puts it beside (9, 8): the nearest biting tile.
    expect(end).toEqual(at(9, 7));
    expect(commands[1]).toEqual(
      attack("b", "tunnel-1-charge", PRIMARY_WEAPON_ID),
    );
  });

  it("leaves a charge it cannot reach and bite this turn to the species", () => {
    const { mission } = field(SWARMER, at(1, 1), [
      mouthAt("tunnel-1", 17, 17, true),
    ]);
    expect(decided(mission)).toBe(SPECIES_PLAY);
    // Ten steps off: a dash of both actions gets it there with none
    // left to bite with, so it does not go.
    const dash = field(SWARMER, at(9, 2), [mouthAt("tunnel-1", 9, 13, true)]);
    expect(decided(dash.mission)).toBe(SPECIES_PLAY);
  });

  it("goes for the nearer of two burning charges it could pull, whatever the mouths' order", () => {
    const squadAway = at(4, 14);
    const first = mouthAt("tunnel-1", 12, 4, true);
    // Alone, the first mouth's charge is in this turn's reach: a walk
    // of three and a bite.
    const alone = field(SWARMER, at(9, 4), [first], squadAway).mission;
    expect(decided(alone).at(-1)).toEqual(
      attack("b", "tunnel-1-charge", PRIMARY_WEAPON_ID),
    );
    // With the second mouth's charge beside the bug, that one goes first.
    const { mission } = field(
      SWARMER,
      at(9, 4),
      [first, mouthAt("tunnel-2", 9, 5, true)],
      squadAway,
    );
    expect(decided(mission)).toEqual([
      attack("b", "tunnel-2-charge", PRIMARY_WEAPON_ID),
    ]);
  });

  it("leaves a burrower under a burning charge to its own behaviour, and pulls with it from the phase after it comes up", () => {
    const mouth = mouthAt("tunnel-1", 9, 8, true);
    const { mission } = field(BURROWER, at(9, 8), [mouth]);
    // Burrowed under the charge: how it comes up is its species' call,
    // never a surface and a bite on the charge in one phase.
    expect(decided(mission)).toBe(SPECIES_PLAY);
    /** The burrower up beside the charge, surfaced on `turn`. */
    const up = (turn: number): TacticalState => ({
      ...mission,
      units: mission.units.map((u) =>
        u.id === "b"
          ? {
              ...u,
              pos: at(9, 7),
              status: u.status.filter((status) => status !== "burrowed"),
              surfacedOnTurn: turn,
            }
          : u,
      ),
    });
    // Up since last turn: it pulls.
    expect(decided(up(4))).toEqual([
      attack("b", "tunnel-1-charge", PRIMARY_WEAPON_ID),
    ]);
    // Up this turn (the phase is turn 5's): the charge refuses it
    // (`charge-just-surfaced`), so its species plays.
    expect(decided(up(5))).toBe(SPECIES_PLAY);
  });

  it("never has a spitter spit at a charge: it has no melee weapon", () => {
    const { mission } = field(SPITTER, at(9, 4), [
      mouthAt("tunnel-1", 9, 5, true),
    ]);
    expect(decided(mission)).toBe(SPECIES_PLAY);
  });

  it("has a brute bite it from the tile of its block nearest the charge", () => {
    const { mission } = field(BRUTE, at(6, 4), [
      mouthAt("tunnel-1", 9, 5, true),
    ]);
    const commands = pullCharge(bugView(mission), "b", CTX);
    expect(commands?.at(-1)).toEqual(
      attack("b", "tunnel-1-charge", PRIMARY_WEAPON_ID),
    );
  });
});

describe("ChargeFirstLookup", () => {
  it("hands out each registered behaviour wrapped, under its own tag, and nothing for an unknown tag", () => {
    const registry = new MapBehaviourRegistry([STAND_IN]);
    const lookup = new ChargeFirstLookup(registry);
    const rush = lookup.get("rush");
    expect(rush).toBeInstanceOf(ChargeFirstBehaviour);
    expect(rush?.tag).toBe("rush");
    expect(lookup.get("rush")).toBe(rush);
    expect(lookup.get("burrow")).toBeUndefined();
  });

  it("pulls the charge through the real bug phase: the move and the bite both land", () => {
    const attackDeps = fixtureAttackDeps();
    const reaction = createOverwatchReaction(COMBAT_TUNING, attackDeps);
    const handlers: TacticalHandlers = {
      [ATTACK]: createAttackHandler(COMBAT_TUNING, attackDeps),
      [MOVE]: createMoveHandler(reaction),
      [SURFACE]: createSurfaceHandler(BURROW_TUNING, reaction),
    };
    const phase = createBugPhaseRunner({
      handlers,
      registry: new ChargeFirstLookup(
        new MapBehaviourRegistry([new SwarmerBehaviour()]),
      ),
      speciesOf: () => SWARMER,
      combat: COMBAT_TUNING,
    });
    const { mission } = field(SWARMER, at(9, 2), [
      mouthAt("tunnel-1", 9, 8, true),
    ]);
    const applied = phase(mission, ctxWith(riggedRng(true)));
    expect(applied.state.charges).toEqual([]);
    expect(applied.state.tunnelMouths?.[0]?.chargesPulled).toBe(1);
    expect(applied.events.map((e) => e.type)).toContain(TUNNEL_CHARGE_DISARMED);
  });

  it("leaves a bug with a squad beside it and no charge burning to the species, which bites the squad", () => {
    const registry = new ChargeFirstLookup(
      new MapBehaviourRegistry([new SwarmerBehaviour()]),
    );
    const { mission } = field(
      SWARMER,
      at(9, 4),
      [mouthAt("tunnel-1", 9, 5, false)],
      at(10, 4),
    );
    const commands = registry.get("rush")?.choose(bugView(mission), "b", {
      rng: riggedRng(true),
      combat: COMBAT_TUNING,
    });
    expect(commands).toEqual([attack("b", "s")]);
  });
});
