import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../bugs/data/species";
import { manhattanDistance } from "../../core/service/grid-math";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { allows } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import type { Mission } from "../../overworld/model/mission";
import { SPREAD_HELD } from "../../overworld/model/spread-held-event";
import { spreadCooldownOf } from "../../overworld/service/spread-cooldown-service";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { TUNNEL_TUNING } from "../../tactical/data/tunnel-tuning";
import { BUGS_SPAWNED } from "../../tactical/model/bugs-spawned-event";
import { endTurn } from "../../tactical/model/end-turn-command";
import { extract } from "../../tactical/model/extract-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { interact } from "../../tactical/model/interact-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { TUNNEL_CHARGE_DISARMED } from "../../tactical/model/tunnel-charge-disarmed-event";
import { TUNNEL_CHARGE_SET } from "../../tactical/model/tunnel-charge-set-event";
import type { TunnelMouth } from "../../tactical/model/tunnel-mouth";
import { isPulled, isSealed } from "../../tactical/model/tunnel-mouth";
import { TUNNEL_SEALED } from "../../tactical/model/tunnel-sealed-event";
import { passMaskFor } from "../../tactical/model/unit";
import type { UnitBuild } from "../../tactical/service/unit-factory";
import { bugUnit } from "../../tactical/service/unit-factory";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

/** The breaching charge's blast radius (#1132), which the force must be outside. */
const BLAST_RADIUS = 3;

/** The arc's fuse (§6.7): a charge set on turn T seals its mouth on T+3. */
const FUSE_TURNS = 3;

/** The shipped game, played tactically, over memory storage. */
function build(): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
  });
}

/** The campaign the session holds; throws when there is none. */
function live(game: GameComposition): GameState {
  const state = game.session.state;
  if (state === undefined) throw new Error("no campaign in the session");
  return state;
}

/** The active mission; throws when there is none. */
function active(game: GameComposition): TacticalState {
  const mission = live(game).activeMission;
  if (mission === undefined) throw new Error("no active mission");
  return mission;
}

/** Replaces the active mission, as the staging steps below need. */
function stage(game: GameComposition, mission: TacticalState): void {
  game.session.replace({ ...live(game), activeMission: mission });
}

/** The active mission with every bug gone: the force's guns, staged. */
function withoutBugs(mission: TacticalState): TacticalState {
  return { ...mission, units: mission.units.filter((u) => u.team !== "bugs") };
}

/**
 * The active mission with the first squads standing one on each of
 * `mouths` and every other TDF unit on `rest`, bugs as they are.
 */
function posted(
  mission: TacticalState,
  mouths: readonly TunnelMouth[],
  rest: TacticalState["extraction"][number],
): TacticalState {
  const squads = mission.units.filter(
    (u) => u.team === "tdf" && u.kind === "squad",
  );
  return {
    ...mission,
    units: mission.units.map((unit) => {
      if (unit.team !== "tdf") return unit;
      const mouth = mouths[squads.indexOf(unit)];
      return { ...unit, pos: mouth === undefined ? rest : mouth.pos };
    }),
  };
}

/** A tile's coordinates as one string, for sets of tiles. */
function at(tile: TileCoord): string {
  return `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
}

/**
 * A swarmer on a free tile a step from `mouth`'s charge and off the
 * mouth, up since before this turn (no `surfacedOnTurn`): where it
 * bites the charge without a walk. Its id is drawn clear of the
 * mission's own.
 */
function swarmerBeside(mission: TacticalState, mouth: TunnelMouth): UnitBuild {
  const blocked = new Set([
    ...mouth.tiles.map(at),
    ...mission.units.map((unit) => at(unit.pos)),
    ...mission.map.props.flatMap((prop) =>
      [prop.tile, ...(prop.occupiedTiles ?? [])].map(at),
    ),
  ]);
  const tile = mission.map.tiles.find(
    (t) =>
      t.y === mouth.pos.y &&
      manhattanDistance(t, mouth.pos) === 1 &&
      allows(t.pass, passMaskFor("infantry")) &&
      !blocked.has(at(t)),
  );
  if (tile === undefined) throw new Error("no free tile beside the charge");
  return bugUnit(
    BUG_SPECIES.swarmer,
    { pos: { x: tile.x, y: tile.y, z: tile.z }, facing: "n" },
    { ids: new SequentialIdGenerator({ counters: { unit: 900 } }) },
  );
}

/** The mission with `bug` standing on it and its template known. */
function withBug(mission: TacticalState, bug: UnitBuild): TacticalState {
  return {
    ...mission,
    units: [...mission.units, bug.unit],
    templates: { ...mission.templates, [bug.template.id]: bug.template },
  };
}

/**
 * A fresh campaign with one Tunnel Sabotage on the board, racing the
 * first city's spread two days out: the offer as the director records
 * it, placed by hand so the test does not wait on the draw.
 */
function withSabotage(game: GameComposition): Mission {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  const city = fresh.overworld.map.cities[0];
  if (city === undefined) throw new Error("fixture needs a city");
  const day = fresh.overworld.day;
  const offer: Mission = {
    id: "mission-sabotage",
    typeId: "tunnel-sabotage",
    cityId: city.id,
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement: city.scale,
      size: "medium",
      seed: "1179",
    },
    rewards: { credits: 300, techPoints: 10 },
    createdDay: day,
    expiresDay: day + 2,
    ignorePenalty: 0,
    tunnelSabotage: { cityId: city.id, spreadDueDay: day + 2 },
  };
  game.session.start({
    ...fresh,
    overworld: { ...fresh.overworld, missions: [offer] },
  });
  return offer;
}

/** Starts `offer` with the whole starter force. */
function launch(game: GameComposition, offer: Mission): void {
  const roster = live(game).roster;
  const started = game.session.store?.dispatch(
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: roster.squads.map((s) => s.id),
      mechIds: roster.mechs.map((m) => m.id),
    }),
  );
  if (!started?.ok) throw new Error("the mission did not start");
}

// ===========================================
// The live composition, end to end
// ===========================================

describe("Tunnel Sabotage through the composition root (arc §6.7)", () => {
  it("sets three charges; a swarmer beside one pulls it unguarded; a new charge on a full fuse, guarded, seals it; extracts and holds the spread", () => {
    const game = build();
    const offer = withSabotage(game);
    const cityId = offer.tunnelSabotage?.cityId ?? offer.cityId;
    launch(game, offer);

    // Started: three mouths, one objective naming them, and no nests.
    const start = active(game);
    const mouths = start.tunnelMouths ?? [];
    expect(mouths).toHaveLength(3);
    expect(start.spawners).toEqual([]);
    const objective = start.objectives.find((o) => o.kind === "seal-tunnels");
    if (objective?.kind !== "seal-tunnels") throw new Error("no objective");
    expect(objective.mouthIds).toEqual(mouths.map((m) => m.id));
    const ramp = start.extraction;
    const rampTile = ramp[0];
    if (rampTile === undefined) throw new Error("no extraction zone");
    // The fixture must keep the force on the ramp out of every blast.
    for (const mouth of mouths) {
      expect(
        Math.min(...ramp.map((t) => manhattanDistance(t, mouth.pos))),
      ).toBeGreaterThan(BLAST_RADIUS);
    }

    // A squad on each mouth sets its charge: the mission's own, for 1 AP.
    const squads = start.units.filter((u) => u.kind === "squad");
    expect(squads.length).toBeGreaterThanOrEqual(3);
    stage(game, posted(start, mouths, rampTile));
    const setOn = active(game).turn;
    for (const squad of squads.slice(0, 3)) {
      const set = game.session.store?.dispatch(
        interact(squad.id, objective.id),
      );
      if (!set?.ok) throw new Error(`no charge set by ${squad.id}`);
    }
    const charged = active(game);
    expect(
      charged.log.filter((e) => e.type === TUNNEL_CHARGE_SET),
    ).toHaveLength(3);
    // The arc's fuse, written out, so a tuning change to it fails here.
    expect(TUNNEL_TUNING.fuseTurns).toBe(FUSE_TURNS);
    expect(charged.charges.map((c) => c.detonatesOnTurn)).toEqual([
      setOn + FUSE_TURNS,
      setOn + FUSE_TURNS,
      setOn + FUSE_TURNS,
    ]);

    // Everyone back to the ramp, clear of the blasts, and nobody guards
    // the swarmer standing a step from the first mouth's charge.
    const first = mouths[0];
    if (first === undefined) throw new Error("no first mouth");
    const sentry = swarmerBeside(charged, first);
    stage(game, posted(withBug(charged, sentry), [], rampTile));
    for (let turn = 1; turn <= FUSE_TURNS; turn++) {
      expect(game.session.store?.dispatch(endTurn())?.ok).toBe(true);
      expect(active(game).outcome).toBeUndefined();
    }

    // The swarmer pulled the first mouth's charge with one bite (Ben's
    // rule, 2026-09-28): that mouth is open again, and the rest went on
    // time unless a burrower that came up a mouth pulled its charge from
    // the phase after it surfaced (`charge-just-surfaced`).
    const burnt = active(game);
    expect(burnt.turn).toBe(setOn + FUSE_TURNS);
    const tunnelled = burnt.log.flatMap((e) =>
      e.type === BUGS_SPAWNED && e.payload.source === "tunnel"
        ? [e.payload]
        : [],
    );
    for (const spawned of tunnelled) {
      expect(mouths.map((m) => m.id)).toContain(spawned.sourceId);
      expect(spawned.unitIds).toHaveLength(1);
    }
    const pulls = burnt.log.flatMap((e) =>
      e.type === TUNNEL_CHARGE_DISARMED ? [e.payload] : [],
    );
    expect(pulls).toContainEqual(
      expect.objectContaining({ unitId: sentry.unit.id, mouthId: first.id }),
    );
    for (const pull of pulls) {
      expect(pull.objectiveId).toBe(objective.id);
      if (pull.unitId !== sentry.unit.id) {
        expect(tunnelled.some((t) => t.unitIds.includes(pull.unitId))).toBe(
          true,
        );
      }
    }
    const after = burnt.tunnelMouths ?? [];
    const reopened = after.filter(isPulled);
    expect(reopened.map((m) => m.id).sort()).toEqual(
      pulls.map((p) => p.mouthId).sort(),
    );
    expect(reopened.some(isSealed)).toBe(false);
    for (const mouth of after.filter((m) => !isPulled(m))) {
      expect(mouth.sealedOnTurn).toBe(setOn + FUSE_TURNS);
    }
    expect(burnt.charges).toEqual([]);
    expect(burnt.log.filter((e) => e.type === TUNNEL_SEALED)).toHaveLength(
      3 - reopened.length,
    );

    // The force clears the field and a squad on each open mouth sets a
    // new charge: a new id, on a full fuse.
    stage(game, posted(withoutBugs(burnt), reopened, rampTile));
    const resetOn = active(game).turn;
    for (const squad of squads.slice(0, reopened.length)) {
      const set = game.session.store?.dispatch(
        interact(squad.id, objective.id),
      );
      if (!set?.ok) throw new Error(`no charge re-set by ${squad.id}`);
    }
    expect(active(game).charges.map((c) => [c.id, c.detonatesOnTurn])).toEqual(
      reopened.map((m) => [`${m.id}-charge-2`, resetOn + FUSE_TURNS]),
    );

    // Guarded this time: every bug that comes up is shot, staged as the
    // board cleared before each end turn.
    stage(game, posted(active(game), [], rampTile));
    for (let turn = 1; turn <= FUSE_TURNS; turn++) {
      stage(game, withoutBugs(active(game)));
      expect(game.session.store?.dispatch(endTurn())?.ok).toBe(true);
      expect(active(game).outcome).toBeUndefined();
    }
    const blown = active(game);
    expect((blown.tunnelMouths ?? []).every(isSealed)).toBe(true);
    expect(blown.charges).toEqual([]);
    expect(blown.log.filter((e) => e.type === TUNNEL_SEALED)).toHaveLength(3);

    // Board and finish: every mouth sealed and the force home is a win.
    for (const unit of blown.units.filter((u) => u.team === "tdf")) {
      expect(game.session.store?.dispatch(extract(unit.id))?.ok).toBe(true);
    }
    expect(active(game).outcome).toBe("won");
    const finished = game.session.store?.dispatch(finishMission(offer.id));
    if (!finished?.ok) throw new Error("the mission did not finish");
    const done = live(game);
    expect(done.overworld.lastMissionResult).toMatchObject({
      outcome: "won",
      tunnelsSealed: 3,
      tunnelsTotal: 3,
    });
    expect(spreadCooldownOf(done.overworld.spreadCooldowns, cityId)).toBe(
      MISSION_TUNING.tunnelSabotage.holdDays,
    );
    expect(finished.value.events.filter((e) => e.type === SPREAD_HELD)).toEqual(
      [
        {
          type: SPREAD_HELD,
          payload: { cityId, days: MISSION_TUNING.tunnelSabotage.holdDays },
        },
      ],
    );
  });
});
