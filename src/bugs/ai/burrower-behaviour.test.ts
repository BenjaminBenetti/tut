import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { BURROW_TUNING } from "../../tactical/data/burrow-tuning";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { attack } from "../../tactical/model/attack-command";
import { burrow } from "../../tactical/model/burrow-command";
import { surface } from "../../tactical/model/surface-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { tunnel } from "../../tactical/model/tunnel-command";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { BURROWER, SWARMER } from "../data/species";
import type { BehaviourContext } from "./bug-behaviour";
import { bugView, withBug } from "./bug-mission.test-helper";
import { BurrowerBehaviour } from "./burrower-behaviour";

// ===========================================
// Fixtures
// ===========================================

const ctx = (mission: TacticalState, seed = 1): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

const behaviour = new BurrowerBehaviour(BURROW_TUNING);

/** The squad's tile on every field. */
const MARK = at(6, 2);

/**
 * An open 13×13 field with a squad at `MARK` and a deploy zone in the
 * far corner, and a burrower at `from`, burrowed unless told otherwise.
 * A second squad can be added with `others`.
 */
function field(
  from: TileCoord,
  options: {
    readonly ap?: number;
    readonly surfaced?: boolean;
    readonly surfacedOnTurn?: number;
    readonly turn?: number;
    readonly builder?: (b: FixtureMapBuilder) => FixtureMapBuilder;
    readonly squads?: readonly ReturnType<typeof unitAt>[];
  } = {},
): TacticalState {
  const builder = new FixtureMapBuilder(13, 13, 1)
    .fillGround()
    .deploy([at(12, 12)]);
  const map = (options.builder?.(builder) ?? builder).build();
  const squads = options.squads ?? [unitAt("mark", "infantry", MARK)];
  const base = missionWith(map, squads, {
    phase: "bugs",
    turn: options.turn ?? 1,
  });
  const { mission } = withBug(base, BURROWER, from, "digger");
  return {
    ...mission,
    units: mission.units.map((unit) =>
      unit.id === "digger"
        ? {
            ...unit,
            ap: options.ap ?? unit.ap,
            status: options.surfaced === true ? [] : unit.status,
            ...(options.surfacedOnTurn === undefined
              ? {}
              : { surfacedOnTurn: options.surfacedOnTurn }),
          }
        : unit,
    ),
  };
}

/** The behaviour's commands for the digger, from the bugs' view. */
function chosen(mission: TacticalState, seed = 1): readonly TacticalCommand[] {
  return behaviour.choose(bugView(mission), "digger", ctx(mission, seed));
}

// ===========================================
// Under the ground
// ===========================================

describe("BurrowerBehaviour under the ground", () => {
  it("answers to the burrow tag, which is the burrower's", () => {
    expect(behaviour.tag).toBe(BURROWER.behaviour);
  });

  it("tunnels in beside a squad within one action's dig and comes up, to bite next phase", () => {
    // Four columns: one action to dig, one to come up, none left to bite.
    const commands = chosen(field(at(6, 7)));
    expect(commands).toEqual([tunnel("digger", at(6, 3)), surface("digger")]);
  });

  it("lies in wait beside a squad it can reach but not also come up beside", () => {
    // Eight columns: both actions to dig there, so it waits underground.
    expect(chosen(field(at(6, 11)))).toEqual([tunnel("digger", at(6, 3))]);
  });

  it("comes up and bites at once when it already lies beside its mark", () => {
    expect(chosen(field(at(6, 3)))).toEqual([
      surface("digger"),
      attack("digger", "mark"),
    ]);
  });

  it("waits rather than come up with nothing left to bite with", () => {
    expect(chosen(field(at(6, 3), { ap: 1 }))).toEqual([]);
  });

  it("digs straight under a wall that closes the squad in, found by a kin's eyes", () => {
    // A solid ring of walls around the squad's 3×3 pen: no door at all,
    // and nothing outside sees in. A swarmer shut in with the squad does,
    // and the swarm shares what it sees.
    const pen = (b: FixtureMapBuilder): FixtureMapBuilder => {
      for (let i = 5; i <= 7; i++) {
        b.wall(at(i, 1), "n", "solid");
        b.wall(at(i, 3), "s", "solid");
        b.wall(at(5, i - 4), "w", "solid");
        b.wall(at(7, i - 4), "e", "solid");
      }
      return b;
    };
    const blind = field(at(6, 7), { builder: pen });
    expect(bugView(blind).units.map((u) => u.id)).not.toContain("mark");
    const { mission } = withBug(blind, SWARMER, at(5, 1), "spotter");
    expect(bugView(mission).units.map((u) => u.id)).toContain("mark");
    expect(chosen(mission)).toEqual([
      tunnel("digger", at(6, 3)),
      surface("digger"),
    ]);
  });

  it("comes up out of a watcher's sight when another landing is as near", () => {
    // From (6, 6) four landings beside the mark are in one action's dig.
    // (6, 3) is the nearest, and the one a watcher at (6, 10) can see;
    // its eight tiles of sight stop short of the other three.
    const open = chosen(field(at(6, 6)));
    expect(open).toEqual([tunnel("digger", at(6, 3)), surface("digger")]);
    const squads = [
      unitAt("mark", "infantry", MARK),
      unitAt("watch", "infantry", at(6, 10), { status: ["overwatch"] }),
    ];
    const watched = chosen(field(at(6, 6), { squads }));
    expect(watched[1]).toEqual(surface("digger"));
    const to =
      watched[0]?.type === "tactical:tunnel"
        ? watched[0].payload.to
        : undefined;
    expect([at(5, 2), at(7, 2), at(6, 1)]).toContainEqual(to);
  });

  it("never tunnels toward a squad its side has not seen: it goes for the landing site", () => {
    // The squad is 20 columns off, beyond every bug's eyes, so the view
    // holds nobody; the only lead is the deploy zone at (12, 12).
    const mission = field(at(0, 12), {
      squads: [unitAt("mark", "infantry", at(12, 0))],
    });
    expect(bugView(mission).units.map((u) => u.id)).toEqual(["digger"]);
    const commands = chosen(mission);
    expect(commands).toHaveLength(1);
    const to =
      commands[0]?.type === "tactical:tunnel"
        ? commands[0].payload.to
        : undefined;
    // Ten columns of budget, all spent toward (12, 12) along z = 12.
    expect(to).toEqual(at(10, 12));
  });

  it("comes up to look once it reaches an empty landing site", () => {
    const mission = field(at(12, 12), {
      squads: [unitAt("mark", "infantry", at(0, 0))],
    });
    expect(chosen(mission)).toEqual([surface("digger")]);
  });

  it("chooses the same commands from the same seed", () => {
    const mission = field(at(3, 9), {
      squads: [
        unitAt("mark", "infantry", MARK),
        unitAt("other", "infantry", at(9, 2)),
      ],
    });
    expect(chosen(mission, 7)).toEqual(chosen(mission, 7));
  });
});

// ===========================================
// On the surface
// ===========================================

describe("BurrowerBehaviour on the surface", () => {
  it("bites what it can reach", () => {
    expect(chosen(field(at(6, 3), { surfaced: true }))).toEqual([
      attack("digger", "mark"),
    ]);
  });

  it("walks to a tile it can bite from and bites", () => {
    const commands = chosen(field(at(6, 6), { surfaced: true }));
    expect(commands.map((command) => command.type)).toEqual([
      "tactical:move",
      "tactical:attack",
    ]);
    expect(commands[1]).toEqual(attack("digger", "mark"));
  });

  it("goes back down and digs toward its mark once its cooldown has run", () => {
    // Nine columns off: no walk reaches a bite this turn.
    const commands = chosen(
      field(at(6, 11), {
        surfaced: true,
        surfacedOnTurn: 1,
        turn: 1 + BURROW_TUNING.reburrowCooldownTurns,
      }),
    );
    expect(commands[0]).toEqual(burrow("digger"));
    expect(commands[1]?.type).toBe("tactical:tunnel");
    const to =
      commands[1]?.type === "tactical:tunnel"
        ? commands[1].payload.to
        : undefined;
    expect(to === undefined ? 99 : Math.abs(to.z - MARK.z)).toBeLessThan(9);
  });

  it("walks at its mark while the cooldown is still running", () => {
    const commands = chosen(
      field(at(6, 11), { surfaced: true, surfacedOnTurn: 1, turn: 1 }),
    );
    expect(commands.map((command) => command.type)).toEqual(["tactical:move"]);
  });
});
