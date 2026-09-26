import {
  CONFIGURE_JEV,
  SET_JEV_COMMANDER_PROMPT,
  JEV_ACT,
  DEFAULT_BUG_ACT,
} from "../../tactical/model/jev-command";
import { MECH_ACTION } from "../../tactical/model/mech-action-command";
import { describe, expect, it } from "vitest";

import {
  startedMission,
  walkableTileNear,
  withBug,
} from "../../bugs/ai/bug-mission.test-helper";
import {
  BRUTE,
  BUG_SPECIES,
  HIVE_GUARD,
  SPITTER,
  SWARMER,
} from "../../bugs/data/species";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { ok } from "../../core/model/result";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import type { GameState } from "../../save/model/game-state";
import { ATTACK } from "../../tactical/model/attack-command";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { BUGS_SPAWNED } from "../../tactical/model/bugs-spawned-event";
import { BROOD_TUNING } from "../../tactical/data/brood-tuning";
import { BROOD_WOKE } from "../../tactical/model/brood-woke-event";
import { CIVILIAN_SOURCE_ID } from "../../tactical/model/civilian";
import { MOVE, move } from "../../tactical/model/move-command";
import { isDormant } from "../../tactical/model/unit";
import type { Unit } from "../../tactical/model/unit";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { placeDormantBrood } from "../../tactical/service/brood-placement-service";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import { PLACE_UNIT, placeUnit } from "../../tactical/model/place-unit-command";
import { UNIT_PLACED } from "../../tactical/model/unit-placed-event";
import { RELOAD } from "../../tactical/model/reload-command";
import {
  USE_EQUIPMENT,
  useEquipment,
} from "../../tactical/model/use-equipment-command";
import { EXTRACT, extract } from "../../tactical/model/extract-command";
import { HARVEST_CARCASS } from "../../tactical/model/harvest-carcass-command";
import { INTERACT } from "../../tactical/model/interact-command";
import { OBJECTIVE_UPDATED } from "../../tactical/model/objective-updated-event";
import { ABANDON_MISSION } from "../../tactical/model/abandon-mission-command";
import { END_TURN, endTurn } from "../../tactical/model/end-turn-command";
import type { TacticalHandler } from "../../tactical/model/tactical-handler";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { PersonaId } from "../../content/model/persona-id";
import { defaultBugAct } from "../../tactical/model/jev-command";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import { MISSION_SETUP_RULES } from "../../tactical/service/missions/mission-setup-rules";
import { hasLineOfSight } from "../../tactical/service/sight-service";
import { attackDistance } from "../../tactical/service/weapon-reach-service";
import { NO_ACTIVE_MISSION } from "../../tactical/service/tactical-command-handlers";
import { placeHiveGuards } from "../../tactical/service/placed-bug-service";
import { withVision } from "../../tactical/service/vision-service";
import { TacticalMissionResolver } from "../../tactical/service/tactical-mission-resolver";
import {
  campaignOnDay,
  missionAt,
} from "../../ui/view/mission-fixtures.test-helper";
import { GameStore } from "./game-store";
import type { TacticalContent } from "./tactical-composition";
import {
  composeTactical,
  createSheetLookup,
  shippedBugBehaviours,
  shippedTacticalHandlers,
} from "./tactical-composition";
import { MapBehaviourRegistry } from "../../bugs/ai/behaviour-registry";

// ===========================================
// Fixtures
// ===========================================

const CONTENT: TacticalContent = {
  squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
  parts: new StaticPartCatalogue(STARTER_PARTS),
  rating: MECH_RATING_TUNING,
  upgrades: UPGRADE_TUNING,
  missionTypes: MISSION_TYPES,
  tech: new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES)),
  infantryUpgrades: INFANTRY_UPGRADES,
};

/** A stub EndTurn rule: bumps the turn and reports it. */
const bumpTurn: TacticalHandler = (mission) =>
  ok({
    state: { ...mission, turn: mission.turn + 1 },
    events: [
      {
        type: TURN_STARTED,
        payload: { turn: mission.turn + 1, phase: "player" },
      },
    ],
  });

/**
 * A started mission, in the player's phase, with a swarmer three tiles
 * off the first squad, marked with `persona` when one is given.
 */
function personaSwarmer(persona: PersonaId | undefined): {
  state: TacticalState;
  bugId: string;
} {
  const mission = startedMission("player");
  const squad = mission.units.find((u) => u.team === "tdf");
  if (squad === undefined) throw new Error("fixture mission has no squad");
  const placed = withBug(
    mission,
    SWARMER,
    walkableTileNear(mission, {
      x: squad.pos.x + 3,
      y: squad.pos.y,
      z: squad.pos.z + 3,
    }),
  );
  return {
    bugId: placed.bug.id,
    state: {
      ...placed.mission,
      units: placed.mission.units.map((u) =>
        u.id === placed.bug.id && persona !== undefined ? { ...u, persona } : u,
      ),
    },
  };
}

/** A campaign on day 4 with one offered mission at Lagos. */
function campaignWithMission(): { state: GameState; missionId: string } {
  const missionId = "mission-2";
  return {
    state: campaignOnDay(4, [missionAt(missionId, "lagos", 9, 5)]),
    missionId,
  };
}

// ===========================================
// Tests
// ===========================================

describe("composeTactical", () => {
  it("registers the given handlers lifted over activeMission and the store notifies with their events", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT, {
      [END_TURN]: bumpTurn,
    });
    const { state, missionId } = campaignWithMission();
    const ids = new SequentialIdGenerator();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(ids),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const store = new GameStore(started.value, dispatcher);
    const seen: string[] = [];
    store.subscribe((change) => {
      seen.push(...change.events.map((e) => e.type));
    });
    const outcome = store.dispatch(endTurn());
    expect(outcome.ok).toBe(true);
    expect(store.getState().activeMission?.turn).toBe(2);
    // Two in the log — the mission's own opening announcement (#573) and
    // the one this EndTurn raised — but only the second was dispatched,
    // so a subscriber still sees exactly one.
    expect(store.getState().activeMission?.log.map((e) => e.type)).toEqual([
      TURN_STARTED,
      TURN_STARTED,
    ]);
    expect(seen).toEqual([TURN_STARTED]);
  });

  it("rejects a tactical command with no mission in progress", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    composeTactical(dispatcher, CONTENT, { [END_TURN]: bumpTurn });
    const store = new GameStore(campaignOnDay(1, []), dispatcher);
    const outcome = store.dispatch(endTurn());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(NO_ACTIVE_MISSION);
  });

  it("registers the shipped rules by default", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    expect(Object.keys(tactical.handlers)).toEqual([
      MECH_ACTION,
      ATTACK,
      MOVE,
      OVERWATCH,
      RELOAD,
      USE_EQUIPMENT,
      INTERACT,
      HARVEST_CARCASS,
      EXTRACT,
      ABANDON_MISSION,
      // The development tools' placement is registered in every build
      // (#1136), refusing outside a dev one.
      PLACE_UNIT,
      // EndTurn is registered last because it closes over the action
      // rules above: the bug phase drives them and must not be able to
      // recurse into the turn engine (#335).
      CONFIGURE_JEV,
      SET_JEV_COMMANDER_PROMPT,
      JEV_ACT,
      DEFAULT_BUG_ACT,
      END_TURN,
    ]);
  });

  describe("development tools (#1136)", () => {
    /** A live mission on the composed dispatcher, with the whole starter force placed. */
    function liveMission(devTools: boolean) {
      const dispatcher = createOverworldCommandDispatcher<GameState>();
      const tactical = composeTactical(dispatcher, CONTENT, undefined, {
        devTools,
      });
      const { state, missionId } = campaignWithMission();
      const started = startTacticalMission(
        state,
        missionId,
        {
          missionId,
          squadIds: state.roster.squads.map((s) => s.id),
          mechIds: state.roster.mechs.map((m) => m.id),
        },
        tactical.missionStartDepsFor(new SequentialIdGenerator()),
      );
      if (!started.ok) throw new Error("fixture mission must start");
      const mission = started.value.activeMission!;
      const beside = walkableTileNear(mission, mission.units[0]!.pos);
      return {
        tactical,
        dispatcher,
        store: new GameStore(started.value, dispatcher),
        missionId,
        beside,
        unitsBefore: mission.units.length,
      };
    }

    it("offers no tools and refuses PlaceUnit as debug-disabled by default", () => {
      const { tactical, store, missionId, beside, unitsBefore } =
        liveMission(false);
      expect(tactical.devTools).toBeUndefined();
      const outcome = store.dispatch(
        placeUnit(missionId, "bug", "swarmer", beside),
      );
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("debug-disabled");
      expect(store.getState().activeMission?.units).toHaveLength(unitsBefore);
    });

    it("in a dev build lists what can be placed, and a PlaceUnit lands on the map, logged and spotted", () => {
      const { tactical, store, missionId, beside, unitsBefore } =
        liveMission(true);
      expect(tactical.devTools?.placeable).toContainEqual({
        kind: "squad",
        id: "rifle",
        name: "Rifle Squad",
      });
      expect(tactical.devTools?.placeable).toContainEqual({
        kind: "mech",
        id: "starter",
        name: "Mech (starter)",
      });
      expect(tactical.devTools?.placeable).toContainEqual({
        kind: "bug",
        id: "swarmer",
        name: "Swarmer",
      });
      const outcome = store.dispatch(
        placeUnit(missionId, "bug", "swarmer", beside),
      );
      expect(outcome.ok).toBe(true);
      const mission = store.getState().activeMission!;
      expect(mission.units).toHaveLength(unitsBefore + 1);
      const placed = mission.units.at(-1)!;
      expect(placed).toMatchObject({ team: "bugs", sourceId: "swarmer" });
      expect(mission.log.some((e) => e.type === UNIT_PLACED)).toBe(true);
      // Vision was recomputed by the lift: a bug put down beside the
      // force is seen at once.
      expect(mission.vision.tdf.spotted).toContain(placed.id);
    });

    it("in a dev build places a trapped civilian group that the mission's rescue tracks (campaign arc §6.4)", () => {
      const { tactical, store, missionId, beside } = liveMission(true);
      expect(tactical.devTools?.placeable).toContainEqual({
        kind: "civilian",
        id: CIVILIAN_SOURCE_ID,
        name: "Civilians (trapped)",
      });
      const outcome = store.dispatch(
        placeUnit(missionId, "civilian", CIVILIAN_SOURCE_ID, beside),
      );
      expect(outcome.ok).toBe(true);
      const mission = store.getState().activeMission!;
      const placed = mission.units.at(-1)!;
      expect(placed).toMatchObject({ kind: "civilian", trapped: true, ap: 0 });
      expect(
        mission.objectives.find(
          (objective) => objective.kind === "rescue-civilians",
        ),
      ).toMatchObject({ groupIds: [placed.id] });
    });

    describe("the armoured variants' plate in a live mission (#1179)", () => {
      /**
       * Fires the first squad's weapon at `species`, put down beside it by
       * the development tools, from the given mission state and RNG: the
       * shipped PlaceUnit and Attack rules end to end, species catalogue
       * and combat tuning included.
       */
      function shotAt(
        live: ReturnType<typeof liveMission>,
        species: "swarmer" | "swarmer-armoured",
        seed: number,
      ): { hit: boolean; damage: number; targetHp: number; hp: number } {
        const start = live.store.getState();
        const mission = start.activeMission!;
        const squad = mission.units.find((u) => u.kind === "squad")!;
        // The fixture started its mission on a fresh id generator, so the
        // store's own counter would hand the new bug the mech's id: move
        // it past every unit already on the map.
        const store = new GameStore(
          {
            ...start,
            meta: {
              ...start.meta,
              rng: { ...start.meta.rng, state: seed },
              ids: {
                ...start.meta.ids,
                counters: { ...start.meta.ids.counters, unit: 100 },
              },
            },
          },
          live.dispatcher,
        );
        const tile = walkableTileNear(mission, squad.pos);
        const placed = store.dispatch(
          placeUnit(live.missionId, "bug", species, tile),
        );
        if (!placed.ok) throw new Error(`placing a ${species} failed`);
        const target = store.getState().activeMission!.units.at(-1)!;
        expect(target.sourceId).toBe(species);
        const fired = store.dispatch({
          type: ATTACK,
          payload: { attackerId: squad.id, targetId: target.id },
        });
        if (!fired.ok) throw new Error(`the shot failed: ${fired.error.code}`);
        const shot = fired.value.events.find((e) => e.type === ATTACK_RESOLVED);
        if (shot?.type !== ATTACK_RESOLVED) throw new Error("no shot resolved");
        return { ...shot.payload, hp: target.hp };
      }

      it("an armoured swarmer takes less from the same shot than a swarmer, a point of plate less", () => {
        const live = liveMission(true);
        const plate =
          BUG_SPECIES["swarmer-armoured"].armor - BUG_SPECIES.swarmer.armor;
        expect(plate).toBe(1);
        let compared = 0;
        for (let seed = 1; seed <= 12; seed++) {
          const plain = shotAt(live, "swarmer", seed);
          const armoured = shotAt(live, "swarmer-armoured", seed);
          // Placed at full strength: the variant's extra body is there.
          expect(plain.hp).toBe(BUG_SPECIES.swarmer.hp);
          expect(armoured.hp).toBe(BUG_SPECIES["swarmer-armoured"].hp);
          // The same roll to hit: plate turns damage, not the shot.
          expect(armoured.hit).toBe(plain.hit);
          if (!plain.hit) continue;
          compared++;
          expect(armoured.damage).toBe(Math.max(1, plain.damage - plate));
          expect(armoured.damage).toBeLessThan(plain.damage);
          expect(armoured.targetHp).toBe(armoured.hp - armoured.damage);
        }
        // Enough hits among the seeds for the comparison to mean something.
        expect(compared).toBeGreaterThanOrEqual(3);
      });

      it("lists each variant in the development tools' enemies, by its species name", () => {
        const { tactical } = liveMission(true);
        for (const [id, name] of [
          ["swarmer-armoured", "Armoured Swarmer"],
          ["lurker-armoured", "Armoured Lurker"],
          ["brute-armoured", "Armoured Brute"],
        ] as const) {
          expect(tactical.devTools?.placeable).toContainEqual({
            kind: "bug",
            id,
            name,
          });
        }
      });
    });
  });

  describe("squad kit from research (#1179)", () => {
    /** The kit of every squad on a mission started from `state` with the shipped deps. */
    function squadKits(unlocked: readonly string[]): string[][] {
      const dispatcher = createOverworldCommandDispatcher<GameState>();
      const tactical = composeTactical(dispatcher, CONTENT);
      const { state: base, missionId } = campaignWithMission();
      const state: GameState = { ...base, tech: { unlocked } };
      const started = startTacticalMission(
        state,
        missionId,
        {
          missionId,
          squadIds: state.roster.squads.map((s) => s.id),
          mechIds: [],
        },
        tactical.missionStartDepsFor(new SequentialIdGenerator()),
      );
      if (!started.ok) throw new Error("fixture mission must start");
      const mission = started.value.activeMission!;
      return mission.units
        .filter((unit) => unit.kind === "squad")
        .map((unit) => [
          ...(mission.templates[unit.templateId]?.equipment ?? []),
        ]);
    }

    it("gives no squad a capture net before Pheromone Analysis is bought", () => {
      const kits = squadKits(["tech.jump-jets"]);
      expect(kits.length).toBeGreaterThan(0);
      for (const kit of kits) {
        expect(kit).not.toContain("capture-net");
      }
    });

    it("gives every squad one capture net after it, behind its type's own kit", () => {
      const before = squadKits([]);
      const after = squadKits(["tech.pheromone-analysis"]);
      expect(after).toEqual(before.map((kit) => [...kit, "capture-net"]));
    });

    it("hands out the net through the same infantry upgrades as the family's swaps", () => {
      const before = squadKits([]);
      expect(before.some((kit) => kit.includes("grenade"))).toBe(true);
      const after = squadKits([
        "tech.frag-grenades",
        "tech.pheromone-analysis",
      ]);
      expect(after).toEqual(
        before.map((kit) => [
          ...kit.map((id) => (id === "grenade" ? "frag-grenade" : id)),
          "capture-net",
        ]),
      );
    });
  });

  describe("a netted bug (#1179)", () => {
    /**
     * A started mission with a one-hit-point swarmer beside the first
     * squad, a capture objective wanting swarmers and a net in every
     * squad's kit, live on the composed dispatcher.
     */
    function netReady() {
      const dispatcher = createOverworldCommandDispatcher<GameState>();
      const tactical = composeTactical(dispatcher, CONTENT);
      const { state, missionId } = campaignWithMission();
      const started = startTacticalMission(
        state,
        missionId,
        {
          missionId,
          squadIds: state.roster.squads.map((s) => s.id),
          mechIds: [],
        },
        tactical.missionStartDepsFor(new SequentialIdGenerator()),
      );
      if (!started.ok) throw new Error("fixture mission must start");
      const mission = started.value.activeMission!;
      const squad = mission.units.find((u) => u.kind === "squad")!;
      const beside = [
        { x: 1, z: 0 },
        { x: -1, z: 0 },
        { x: 0, z: 1 },
        { x: 0, z: -1 },
      ]
        .map((d) => ({
          x: squad.pos.x + d.x,
          y: squad.pos.y,
          z: squad.pos.z + d.z,
        }))
        .find((tile) => {
          const near = walkableTileNear(mission, tile);
          return near.x === tile.x && near.y === tile.y && near.z === tile.z;
        });
      if (beside === undefined)
        throw new Error("no free tile beside the squad");
      const placed = withBug(mission, SWARMER, beside, "netted-bug");
      const netted: TacticalState = {
        ...placed.mission,
        units: placed.mission.units.map((u) =>
          u.id === "netted-bug" ? { ...u, hp: 1 } : u,
        ),
        objectives: [
          ...placed.mission.objectives,
          {
            id: "objective-capture",
            kind: "capture-specimen",
            species: "swarmer",
            complete: false,
            failed: false,
          },
        ],
        templates: {
          ...placed.mission.templates,
          [squad.templateId]: {
            ...placed.mission.templates[squad.templateId]!,
            equipment: [
              ...(placed.mission.templates[squad.templateId]?.equipment ?? []),
              "capture-net",
            ],
          },
        },
      };
      return {
        store: new GameStore(
          { ...started.value, activeMission: netted },
          dispatcher,
        ),
        squad,
        beside,
      };
    }

    /** Whatever the bugs' phase logged that names the netted bug. */
    function bugPhaseMentions(
      store: ReturnType<typeof netReady>["store"],
    ): string[] {
      const before = store.getState().activeMission!.log.length;
      const ended = store.dispatch(endTurn());
      expect(ended.ok).toBe(true);
      return store
        .getState()
        .activeMission!.log.slice(before)
        .filter((event) => JSON.stringify(event.payload).includes("netted-bug"))
        .map((event) => event.type);
    }

    it("acts in the bugs' phase while it is loose: the fixture exhibits the case", () => {
      const { store } = netReady();
      expect(bugPhaseMentions(store)).not.toEqual([]);
    });

    it("stops acting once netted: it is off the map and the bugs' phase never names it", () => {
      const { store, squad, beside } = netReady();
      const thrown = store.dispatch(
        useEquipment(squad.id, "capture-net", beside),
      );
      if (!thrown.ok) throw new Error(thrown.error.code);
      const mission = store.getState().activeMission!;
      expect(mission.units.some((u) => u.id === "netted-bug")).toBe(false);
      expect(
        mission.units.find((u) => u.id === squad.id)?.carrying,
      ).toMatchObject({
        unitId: "netted-bug",
        species: "swarmer",
      });
      expect(mission.vision.tdf.spotted).not.toContain("netted-bug");
      expect(bugPhaseMentions(store)).toEqual([]);
    });
  });

  it("routes a registered rule at the mission, not at unknown-command", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    composeTactical(dispatcher, CONTENT);
    const outcome = dispatcher.process(campaignOnDay(1, []), extract("unit-1"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe(NO_ACTIVE_MISSION);
  });

  it("builds a tactical resolver over a source of the finished mission", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const resolver = tactical.resolverFor(() => undefined);
    expect(resolver).toBeInstanceOf(TacticalMissionResolver);
  });

  it("one EndTurn plays the bug phase and hands the next turn back to the player (#412)", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state, missionId } = campaignWithMission();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(new SequentialIdGenerator()),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const store = new GameStore(started.value, dispatcher);
    const outcome = store.dispatch(endTurn());
    expect(outcome.ok).toBe(true);
    const mission = store.getState().activeMission;
    expect(mission?.phase).toBe("player");
    expect(mission?.turn).toBe(2);
    expect(mission?.outcome).toBeUndefined();
    expect(
      mission?.log.filter((e) => e.type === TURN_STARTED).map((e) => e.payload),
    ).toEqual([
      { turn: 1, phase: "player" },
      { turn: 1, phase: "bugs" },
      { turn: 2, phase: "player" },
    ]);
  });

  it("keeps the spawn steps in the bugs phase alongside the runner: the first edge wave lands on turn 3 (#329, #335)", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state, missionId } = campaignWithMission();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(new SequentialIdGenerator()),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const store = new GameStore(started.value, dispatcher);
    for (let turn = 0; turn < 3; turn++) {
      expect(store.dispatch(endTurn()).ok).toBe(true);
    }
    const mission = store.getState().activeMission;
    expect(mission?.turn).toBe(4);
    expect(mission?.phase).toBe("player");
    expect(
      mission?.log.filter((e) => e.type === BUGS_SPAWNED),
    ).not.toHaveLength(0);
    expect(mission?.units.some((u) => u.team === "bugs")).toBe(true);
  });

  it("fails an objective whose deadline has passed as the next turn opens (ADR 0013 §2.3)", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state, missionId } = campaignWithMission();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(new SequentialIdGenerator()),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const active = started.value.activeMission;
    const timed = active?.objectives[0];
    expect(timed?.kind).toBe("destroy-spawner");
    if (active === undefined || timed === undefined) return;
    // Nothing ships with a deadline yet: give the first objective one.
    const store = new GameStore(
      {
        ...started.value,
        activeMission: {
          ...active,
          objectives: active.objectives.map((objective) =>
            objective.id === timed.id
              ? { ...objective, deadlineTurn: 1 }
              : objective,
          ),
        },
      },
      dispatcher,
    );
    expect(store.dispatch(endTurn()).ok).toBe(true);
    const mission = store.getState().activeMission;
    expect(mission?.turn).toBe(2);
    expect(mission?.outcome).toBeUndefined();
    expect(mission?.objectives.find((o) => o.id === timed.id)).toMatchObject({
      complete: false,
      failed: true,
    });
    expect(
      mission?.log
        .filter((e) => e.type === OBJECTIVE_UPDATED)
        .map((e) => e.payload),
    ).toEqual([{ objectiveId: timed.id, complete: false, failed: true }]);
  });

  it("mission-start deps carry the brood content a hive cavern's setup places from (#1179)", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const deps = tactical.missionStartDepsFor(new SequentialIdGenerator());
    expect(deps.broods?.tuning).toBe(BROOD_TUNING);
    expect(deps.broods?.species).toEqual(Object.values(BUG_SPECIES));
  });

  it("mission-start deps carry the shipped mission setup rules", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    expect(
      tactical.missionStartDepsFor(new SequentialIdGenerator()).setupRules,
    ).toBe(MISSION_SETUP_RULES);
  });

  it("mission-start deps place the whole starter roster on a generated map", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state, missionId } = campaignWithMission();
    const started = startTacticalMission(
      state,
      missionId,
      {
        missionId,
        squadIds: state.roster.squads.map((s) => s.id),
        mechIds: state.roster.mechs.map((m) => m.id),
      },
      tactical.missionStartDepsFor(new SequentialIdGenerator()),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const mission = started.value.activeMission;
    expect(mission?.missionId).toBe(missionId);
    expect(mission?.map.width).toBeGreaterThan(0);
    expect(mission?.units.filter((u) => u.team === "tdf")).toHaveLength(
      state.roster.squads.length + state.roster.mechs.length,
    );
  });

  it("mission-start deps fold the campaign's infantry research into every squad it deploys (campaign arc §10.3)", () => {
    const dispatcher = createOverworldCommandDispatcher<GameState>();
    const tactical = composeTactical(dispatcher, CONTENT);
    const { state: fresh, missionId } = campaignWithMission();
    /** The squads' templates of a mission started from `state`. */
    const squadTemplates = (state: GameState) => {
      const started = startTacticalMission(
        state,
        missionId,
        {
          missionId,
          squadIds: state.roster.squads.map((s) => s.id),
          mechIds: [],
        },
        tactical.missionStartDepsFor(new SequentialIdGenerator()),
      );
      if (!started.ok) throw new Error("mission should start");
      const mission = started.value.activeMission!;
      return mission.units
        .filter((u) => u.kind === "squad")
        .map((u) => mission.templates[u.templateId]!);
    };
    const bare = squadTemplates(fresh);
    expect(bare.length).toBeGreaterThan(0);
    expect(bare.every((t) => t.armor === 0)).toBe(true);
    expect(bare.every((t) => t.equipment?.includes("grenade"))).toBe(true);

    const researched = squadTemplates({
      ...fresh,
      tech: {
        unlocked: [
          "tech.squad-armour-1",
          "tech.squad-armour-2",
          "tech.frag-grenades",
        ],
      },
    });
    expect(researched.map((t) => t.armor)).toEqual(bare.map(() => 2));
    expect(researched.map((t) => t.equipment)).toEqual(
      bare.map((t) =>
        t.equipment?.map((id) => (id === "grenade" ? "frag-grenade" : id)),
      ),
    );
  });
});

describe("createSheetLookup", () => {
  it("returns the sheet for a mech whose loadout validates and undefined otherwise", () => {
    const sheetFor = createSheetLookup(
      CONTENT.parts,
      CONTENT.rating,
      CONTENT.upgrades,
    );
    const mech = campaignOnDay(1, []).roster.mechs[0]!;
    expect(sheetFor(mech)?.combatRating).toBeGreaterThan(0);
    expect(
      sheetFor({ ...mech, loadout: { ...mech.loadout, legsId: "nope" } }),
    ).toBeUndefined();
  });
});

describe("shippedBugBehaviours", () => {
  // The species whose behaviour has not merged yet. Every other species
  // must be registered, so landing a behaviour class without wiring it
  // into shippedBugBehaviours fails here instead of shipping a bug that
  // stands still for a whole mission.
  const UNLANDED: readonly string[] = [];

  it("registers the behaviours that have landed, one tag each", () => {
    const tags = shippedBugBehaviours().map((b) => b.tag);
    // #333 shipped the lurker's flank, #332 the swarmer's rush and #334
    // the brute's punish-clumps: every tag the catalogue uses is live.
    expect(tags).toContain("flank");
    expect(tags).toContain("rush");
    expect(tags).toContain("punish-clumps");
    expect(new Set(tags).size).toBe(tags.length);
    expect(
      () => new MapBehaviourRegistry(shippedBugBehaviours()),
    ).not.toThrow();
  });

  it("actually drives a brute in a live mission: one shipped EndTurn moves it (#334)", () => {
    const mission = startedMission("player");
    const squad = mission.units.find((u) => u.team === "tdf");
    if (squad === undefined) throw new Error("fixture mission has no squad");
    const placed = withBug(
      mission,
      BRUTE,
      // The brute stands on a 2×2 block (#1130), so the tile is an
      // anchor its whole block fits at.
      walkableTileNear(
        mission,
        {
          x: squad.pos.x + 4,
          y: squad.pos.y,
          z: squad.pos.z + 4,
        },
        BRUTE.footprint,
      ),
      "brute-live",
    );
    const endTurnHandler = shippedTacticalHandlers()[END_TURN];
    if (endTurnHandler === undefined) throw new Error("EndTurn is not shipped");
    const outcome = endTurnHandler(placed.mission, endTurn(), {
      rng: new Mulberry32Rng(5),
      ids: new SequentialIdGenerator(),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const after = outcome.value.state.units.find((u) => u.id === placed.bug.id);
    expect(after?.pos).not.toEqual(placed.bug.pos);
    expect(after?.ap).toBeLessThan(placed.bug.ap);
    expect(outcome.value.state.phase).toBe("player");
  });

  it("actually drives a swarmer in a live mission: one shipped EndTurn moves it (#460)", () => {
    // The registry assertions above prove a behaviour is *registered*.
    // This proves the whole seam still carries it through to the board:
    // shipped EndTurn -> bugs phase -> runner -> species catalogue ->
    // SwarmerBehaviour -> the action rules -> a unit that moved.
    const mission = startedMission("player");
    const squad = mission.units.find((u) => u.team === "tdf");
    if (squad === undefined) throw new Error("fixture mission has no squad");
    const placed = withBug(
      mission,
      SWARMER,
      // Six tiles out, comfortably inside a bug's sight: since ADR 0006
      // a swarmer rushes what it can perceive, and ten tiles away is the
      // edge of that, which `walkableTileNear` can nudge past.
      walkableTileNear(mission, {
        x: squad.pos.x + 3,
        y: squad.pos.y,
        z: squad.pos.z + 3,
      }),
    );
    const endTurnHandler = shippedTacticalHandlers()[END_TURN];
    if (endTurnHandler === undefined) throw new Error("EndTurn is not shipped");
    const outcome = endTurnHandler(placed.mission, endTurn(), {
      rng: new Mulberry32Rng(11),
      ids: new SequentialIdGenerator(),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const after = outcome.value.state.units.find((u) => u.id === placed.bug.id);
    expect(after).toBeDefined();
    expect(after?.pos).not.toEqual(placed.bug.pos);
    expect(after?.ap).toBeLessThan(placed.bug.ap);
    // and the turn still came back to the player
    expect(outcome.value.state.phase).toBe("player");
  });

  it("actually drives a spitter in a live mission: one shipped EndTurn spits at the squad (#1179)", () => {
    // The spitter's whole seam: shipped EndTurn -> bugs phase -> runner
    // -> species catalogue -> SpitterBehaviour -> the attack rules -> a
    // ranged shot that resolved. Placed on the nearest tile that sees
    // the squad from four to six tiles out, so it has a shot this turn.
    const mission = startedMission("player");
    const squad = mission.units.find((u) => u.kind === "squad");
    if (squad === undefined) throw new Error("fixture mission has no squad");
    const occupied = new Set(
      mission.units.map((u) => `${u.pos.x},${u.pos.y},${u.pos.z}`),
    );
    const perch = mission.map.tiles.find(
      (tile) =>
        tile.y === squad.pos.y &&
        tile.pass !== 0 &&
        !occupied.has(`${tile.x},${tile.y},${tile.z}`) &&
        attackDistance(tile, squad.pos) >= 4 &&
        attackDistance(tile, squad.pos) <= SPITTER.weapon.range &&
        hasLineOfSight(mission.map, tile, squad.pos) &&
        walkableTileNear(mission, tile).x === tile.x &&
        walkableTileNear(mission, tile).z === tile.z,
    );
    if (perch === undefined) throw new Error("no perch in sight of the squad");
    const placed = withBug(
      mission,
      SPITTER,
      { x: perch.x, y: perch.y, z: perch.z },
      "spitter-live",
    );
    const endTurnHandler = shippedTacticalHandlers()[END_TURN];
    if (endTurnHandler === undefined) throw new Error("EndTurn is not shipped");
    const outcome = endTurnHandler(placed.mission, endTurn(), {
      rng: new Mulberry32Rng(5),
      ids: new SequentialIdGenerator(),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const shots = outcome.value.events.filter(
      (e) =>
        e.type === ATTACK_RESOLVED && e.payload.attackerId === placed.bug.id,
    );
    expect(shots).toHaveLength(1);
    expect(
      shots[0]?.type === ATTACK_RESOLVED && shots[0].payload.weaponRange,
    ).toBe(SPITTER.weapon.range);
    expect(outcome.value.state.phase).toBe("player");
  });

  it("actually drives a placed Hive Guard in a live mission: one shipped EndTurn throws its spines, and it stays put (#1179)", () => {
    // The guard's whole seam: the placement path a mission's setup takes
    // (placeHiveGuards, ADR 0013 §2.6) -> shipped EndTurn -> bugs phase
    // -> runner -> species catalogue -> HiveGuardBehaviour -> the attack
    // rules -> a ranged volley that resolved. Stood on the nearest tile
    // that sees the squad from four to seven tiles out.
    const mission = startedMission("player");
    const squad = mission.units.find((u) => u.kind === "squad");
    if (squad === undefined) throw new Error("fixture mission has no squad");
    const occupied = new Set(
      mission.units.map((u) => `${u.pos.x},${u.pos.y},${u.pos.z}`),
    );
    const post = mission.map.tiles.find(
      (tile) =>
        tile.y === squad.pos.y &&
        tile.pass !== 0 &&
        !occupied.has(`${tile.x},${tile.y},${tile.z}`) &&
        attackDistance(tile, squad.pos) >= 4 &&
        attackDistance(tile, squad.pos) <= HIVE_GUARD.weapon.range &&
        hasLineOfSight(mission.map, tile, squad.pos) &&
        walkableTileNear(mission, tile).x === tile.x &&
        walkableTileNear(mission, tile).z === tile.z,
    );
    if (post === undefined) throw new Error("no post in sight of the squad");
    const stood = placeHiveGuards(
      mission,
      [{ x: post.x, y: post.y, z: post.z }],
      {
        ids: new SequentialIdGenerator({ counters: { unit: 900 } }),
        guard: HIVE_GUARD,
      },
    );
    // The mission start computes the first look after its setup rule has
    // stood the guards (initialVision); this is that look.
    const placed = withVision({ state: stood, events: [] }).state;
    const guard = placed.units.find((u) => u.sourceId === "hive-guard");
    if (guard === undefined) throw new Error("the guard was not placed");
    const endTurnHandler = shippedTacticalHandlers()[END_TURN];
    if (endTurnHandler === undefined) throw new Error("EndTurn is not shipped");
    const outcome = endTurnHandler(placed, endTurn(), {
      rng: new Mulberry32Rng(5),
      ids: new SequentialIdGenerator(),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const shots = outcome.value.events.filter(
      (e) => e.type === ATTACK_RESOLVED && e.payload.attackerId === guard.id,
    );
    expect(shots).toHaveLength(1);
    expect(
      shots[0]?.type === ATTACK_RESOLVED && shots[0].payload.weaponRange,
    ).toBe(HIVE_GUARD.weapon.range);
    const after = outcome.value.state.units.find((u) => u.id === guard.id);
    expect(after?.pos).toEqual(guard.pos);
    expect(outcome.value.state.phase).toBe("player");
  });

  it("plays a named enemy headless with no controller: no Jev, and EndTurn never stalls (ADR 0013 §2.8)", () => {
    // Auto-resolve and the sim sweeps have no JevController, so nothing
    // configures Jev; the persona plays its deterministic fallback inside
    // the synchronous bug phase, turn after turn.
    const { state: start, bugId } = personaSwarmer("sovereign");
    const endTurnHandler = shippedTacticalHandlers()[END_TURN];
    if (endTurnHandler === undefined) throw new Error("EndTurn is not shipped");
    const rng = new Mulberry32Rng(11);
    const ids = new SequentialIdGenerator();
    let state = start;
    let acted = false;
    for (let turn = 0; turn < 4 && state.outcome === undefined; turn++) {
      const before = state.units.find((u) => u.id === bugId);
      const outcome = endTurnHandler(state, endTurn(), { rng, ids });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      state = outcome.value.state;
      const after = state.units.find((u) => u.id === bugId);
      if (after?.pos.x !== before?.pos.x || after?.pos.z !== before?.pos.z) {
        acted = true;
      }
      if (state.outcome === undefined) {
        expect(state.phase).toBe("player");
      }
      expect(state.jev?.activation?.externalBugs ?? false).toBe(false);
    }
    expect(acted).toBe(true);
    expect(state.jev?.entities[bugId]).toBeUndefined();
  });

  it("wires the persona's fallback into both bug paths: the synchronous phase and a mixed phase's DefaultBugAct", () => {
    // The Sovereign's fallback walks at the densest group where the
    // swarmer it rides would rush; from this spot the two end apart.
    const handlers = shippedTacticalHandlers();
    const endTurnHandler = handlers[END_TURN];
    const defaultAct = handlers[DEFAULT_BUG_ACT];
    if (endTurnHandler === undefined || defaultAct === undefined)
      throw new Error("bug paths are not shipped");
    const endOf = (persona: "sovereign" | undefined) => {
      const { state, bugId } = personaSwarmer(persona);
      const ended = endTurnHandler(state, endTurn(), {
        rng: new Mulberry32Rng(11),
        ids: new SequentialIdGenerator(),
      });
      const bugs = { ...state, phase: "bugs" as const };
      const acted = defaultAct(bugs, defaultBugAct(bugId, bugs.commandSeq), {
        rng: new Mulberry32Rng(11),
        ids: new SequentialIdGenerator(),
      });
      if (!ended.ok || !acted.ok) throw new Error("the bug did not act");
      return [ended.value.state, acted.value.state].map(
        (s) => s.units.find((u) => u.id === bugId)?.pos,
      );
    };
    const [plainPhase, plainAct] = endOf(undefined);
    const [namedPhase, namedAct] = endOf("sovereign");
    expect(namedPhase).not.toEqual(plainPhase);
    expect(namedAct).not.toEqual(plainAct);
  });

  it("gives every species a behaviour unless it is known not to have landed", () => {
    const registry = new MapBehaviourRegistry(shippedBugBehaviours());
    for (const species of Object.values(BUG_SPECIES)) {
      const expected = !UNLANDED.includes(species.behaviour);
      expect(
        registry.get(species.behaviour) !== undefined,
        `${species.id} (${species.behaviour}) registered`,
      ).toBe(expected);
    }
  });
});

// ===========================================
// Dormant broods (#1179)
// ===========================================

describe("dormant broods through the shipped rules (#1179)", () => {
  /**
   * A started mission in the player's phase with a sleeping swarmer
   * brood three tiles off the first squad (zone `radius` around the
   * sleeper) and an awake swarmer on the squad's other side, both
   * within a bug's sight of it.
   */
  function broodBesideSquad(radius: number): {
    mission: TacticalState;
    squad: Unit;
    sleeperId: string;
    awakeId: string;
  } {
    const start = startedMission("player");
    const squad = start.units.find((u) => u.kind === "squad");
    if (squad === undefined) throw new Error("fixture mission has no squad");
    const awake = withBug(
      start,
      SWARMER,
      walkableTileNear(start, {
        x: squad.pos.x - 3,
        y: squad.pos.y,
        z: squad.pos.z - 3,
      }),
      "awake-1",
    );
    const bed = walkableTileNear(awake.mission, {
      x: squad.pos.x + 3,
      y: squad.pos.y,
      z: squad.pos.z + 3,
    });
    const slept = placeDormantBrood(
      awake.mission,
      {
        broodId: "brood-test",
        species: SWARMER,
        positions: [bed],
        wake: { centre: bed, radius },
        label: "east chamber",
      },
      // Numbered past the started mission's own units.
      { ids: new SequentialIdGenerator({ counters: { unit: 100 } }) },
    );
    const sleeper = slept.units.at(-1);
    if (sleeper === undefined || !isDormant(sleeper))
      throw new Error("the brood was not placed");
    return {
      mission: withVision({ state: slept, events: [] }).state,
      squad,
      sleeperId: sleeper.id,
      awakeId: awake.bug.id,
    };
  }

  it("a dormant bug never acts through live EndTurns, while an awake swarmer beside it does", () => {
    const { mission, sleeperId, awakeId } = broodBesideSquad(1);
    const endTurnHandler = shippedTacticalHandlers()[END_TURN];
    if (endTurnHandler === undefined) throw new Error("EndTurn is not shipped");
    const rng = new Mulberry32Rng(11);
    const ids = new SequentialIdGenerator();
    const sleeper = mission.units.find((u) => u.id === sleeperId);
    let state = mission;
    let awakeMoved = false;
    for (let turn = 0; turn < 3 && state.outcome === undefined; turn++) {
      const outcome = endTurnHandler(state, endTurn(), { rng, ids });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      for (const event of outcome.value.events) {
        if (event.type === UNIT_MOVED) {
          expect(event.payload.unitId).not.toBe(sleeperId);
          if (event.payload.unitId === awakeId) awakeMoved = true;
        }
        if (event.type === ATTACK_RESOLVED) {
          expect(event.payload.attackerId).not.toBe(sleeperId);
        }
      }
      state = outcome.value.state;
      expect(state.units.find((u) => u.id === sleeperId)).toEqual(sleeper);
    }
    expect(awakeMoved).toBe(true);
  });

  it("a squad step into the zone through the shipped Move wakes the brood, and the next EndTurn plays it", () => {
    const { mission, squad, sleeperId } = broodBesideSquad(6);
    const handlers = shippedTacticalHandlers();
    const moveHandler = handlers[MOVE];
    const endTurnHandler = handlers[END_TURN];
    if (moveHandler === undefined || endTurnHandler === undefined)
      throw new Error("Move or EndTurn is not shipped");
    const ctx = { rng: new Mulberry32Rng(3), ids: new SequentialIdGenerator() };
    const steps = [
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
      { x: 0, z: -1 },
    ];
    const moved = steps
      .map((step) =>
        moveHandler(
          mission,
          move(squad.id, [
            walkableTileNear(mission, {
              x: squad.pos.x + step.x,
              y: squad.pos.y,
              z: squad.pos.z + step.z,
            }),
          ]),
          ctx,
        ),
      )
      .find((outcome) => outcome.ok);
    if (!moved?.ok) throw new Error("the squad could not step");
    const woke = moved.value.events.filter((e) => e.type === BROOD_WOKE);
    expect(woke).toHaveLength(1);
    expect(woke[0]?.type === BROOD_WOKE && woke[0].payload.cause).toBe("enter");
    const awakened = moved.value.state.units.find((u) => u.id === sleeperId);
    expect(awakened && isDormant(awakened)).toBe(false);
    const ended = endTurnHandler(moved.value.state, endTurn(), ctx);
    if (!ended.ok) throw new Error("EndTurn was refused");
    const acted = ended.value.events.some(
      (e) =>
        (e.type === UNIT_MOVED && e.payload.unitId === sleeperId) ||
        (e.type === ATTACK_RESOLVED && e.payload.attackerId === sleeperId),
    );
    expect(acted).toBe(true);
  });
});
