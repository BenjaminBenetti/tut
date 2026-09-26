import { describe, expect, it } from "vitest";

import { manhattanDistance } from "../../core/service/grid-math";
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
import { TUNNEL_CHARGE_SET } from "../../tactical/model/tunnel-charge-set-event";
import { isSealed } from "../../tactical/model/tunnel-mouth";
import { TUNNEL_SEALED } from "../../tactical/model/tunnel-sealed-event";
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
  it("sets three charges, survives the fuse, seals every mouth on the third turn, extracts and holds the spread", () => {
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
    stage(game, {
      ...start,
      units: start.units.map((unit) => {
        const at = squads.indexOf(unit);
        const mouth = mouths[at];
        return mouth === undefined ? unit : { ...unit, pos: mouth.pos };
      }),
    });
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

    // Everyone back to the ramp, clear of the blasts, to hold for the fuse.
    stage(game, {
      ...charged,
      units: charged.units.map((unit) =>
        unit.team === "tdf" ? { ...unit, pos: rampTile } : unit,
      ),
    });

    // The charges burn through three end turns; the mouths go on the third.
    for (let turn = 1; turn <= FUSE_TURNS; turn++) {
      expect(game.session.store?.dispatch(endTurn())?.ok).toBe(true);
      const now = active(game);
      expect(now.outcome, `turn ${String(now.turn)}`).toBeUndefined();
      const sealed = (now.tunnelMouths ?? []).filter(isSealed);
      expect(sealed.length, `turn ${String(now.turn)}`).toBe(
        turn < FUSE_TURNS ? 0 : 3,
      );
    }
    const blown = active(game);
    expect(blown.turn).toBe(setOn + FUSE_TURNS);
    expect((blown.tunnelMouths ?? []).map((m) => m.sealedOnTurn)).toEqual([
      blown.turn,
      blown.turn,
      blown.turn,
    ]);
    expect(blown.charges).toEqual([]);
    expect(blown.log.filter((e) => e.type === TUNNEL_SEALED)).toHaveLength(3);
    // The mouths sent burrowers up while they were open, and only they did.
    const tunnelled = blown.log.flatMap((e) =>
      e.type === BUGS_SPAWNED && e.payload.source === "tunnel"
        ? [e.payload]
        : [],
    );
    expect(tunnelled.length).toBeGreaterThan(0);
    for (const spawned of tunnelled) {
      expect(mouths.map((m) => m.id)).toContain(spawned.sourceId);
      expect(spawned.unitIds).toHaveLength(1);
    }

    // Board and finish: every mouth sealed and the force home is a win.
    for (const unit of blown.units.filter((u) => u.team === "tdf")) {
      expect(game.session.store?.dispatch(extract(unit.id))?.ok).toBe(true);
    }
    expect(active(game).outcome).toBe("won");
    const finished = game.session.store?.dispatch(finishMission(offer.id));
    if (!finished?.ok) throw new Error("the mission did not finish");
    const after = live(game);
    expect(after.overworld.lastMissionResult).toMatchObject({
      outcome: "won",
      tunnelsSealed: 3,
      tunnelsTotal: 3,
    });
    expect(spreadCooldownOf(after.overworld.spreadCooldowns, cityId)).toBe(
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
