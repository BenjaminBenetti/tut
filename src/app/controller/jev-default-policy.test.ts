import { describe, expect, it, vi } from "vitest";

import { PERSONAS } from "../../bugs/data/personas";
import { createPersonaLookup } from "../../bugs/service/persona-lookup";
import type { PersonaId } from "../../content/model/persona-id";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import type { GameState } from "../../save/model/game-state";
import { CONFIGURE_JEV } from "../../tactical/model/jev-command";
import type { ConfigureJevCommand } from "../../tactical/model/jev-command";
import type { JevControl } from "../../tactical/model/jev-control";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { configureJevHandler } from "../../tactical/service/jev-control-service";
import { registerTacticalCommands } from "../../tactical/service/tactical-command-handlers";
import {
  missionWith,
  openField,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { campaignOnDay } from "../../ui/view/mission-fixtures.test-helper";
import { GameStore } from "../service/game-store";
import {
  JevDefaultPolicy,
  MAX_JEV_PERSONAS_PER_MISSION,
  personaJevConfigurations,
} from "./jev-default-policy";

// ===========================================
// Fixtures
// ===========================================

const personaOf = createPersonaLookup(PERSONAS);

/** A bug at column `x`, carrying `persona` when one is given. */
function bug(
  id: string,
  x: number,
  persona?: PersonaId,
  options: { hp?: number } = {},
): Unit {
  const unit = {
    ...unitAt(id, "infantry", { x, y: 0, z: 7 }, { team: "bugs", ...options }),
    sourceId: "swarmer",
  };
  return persona === undefined ? unit : { ...unit, persona };
}

/** A TDF squad at column `x`. */
function squad(id: string, x: number): Unit {
  return unitAt(id, "infantry", { x, y: 0, z: 0 });
}

/** A mission holding `units`, with optional saved Jev settings. */
function mission(units: readonly Unit[], jev?: JevControl): TacticalState {
  const base = missionWith(openField().build(), units);
  return jev === undefined ? base : { ...base, jev };
}

/**
 * A store whose dispatcher knows one rule, `ConfigureJev` (the fake the
 * policy talks to), with every dispatched command recorded.
 */
function storeWith(active: TacticalState) {
  const dispatcher = createOverworldCommandDispatcher<GameState>();
  registerTacticalCommands(dispatcher, {
    [CONFIGURE_JEV]: configureJevHandler,
  });
  const store = new GameStore<GameState, OverworldCommand, CampaignEvent>(
    { ...campaignOnDay(1, []), activeMission: active },
    dispatcher,
  );
  const dispatched: ConfigureJevCommand[] = [];
  const dispatch = store.dispatch.bind(store);
  vi.spyOn(store, "dispatch").mockImplementation((command) => {
    dispatched.push(command as ConfigureJevCommand);
    return dispatch(command);
  });
  return { store, dispatched };
}

/** A policy over `store`, configured and on unless told otherwise. */
function policyOver(
  store: GameStore<GameState, OverworldCommand, CampaignEvent>,
  options: { configured?: boolean; enabled?: () => boolean } = {},
): JevDefaultPolicy {
  return new JevDefaultPolicy({
    store,
    configured: options.configured ?? true,
    preference: { enabled: options.enabled ?? (() => true) },
    personaOf,
  });
}

// ===========================================
// Tests
// ===========================================

describe("personaJevConfigurations", () => {
  it("configures only living persona bugs: never an ordinary bug, a TDF unit or a dead persona", () => {
    const tdfWithPersona = { ...squad("tdf-named", 0), persona: "alpha" };
    const commands = personaJevConfigurations(
      mission([
        squad("tdf", 1),
        tdfWithPersona as Unit,
        bug("swarm", 2),
        bug("dead-mother", 3, "broodmother", { hp: 0 }),
        bug("mother", 4, "broodmother"),
      ]),
      personaOf,
    );
    expect(commands.map((c) => c.payload.unitId)).toEqual(["mother"]);
    expect(commands[0]?.payload.control).toEqual({
      enabled: true,
      entityPrompt: PERSONAS.broodmother.entityPrompt,
    });
  });

  it("never passes three persona actors per mission, choosing by unit order and counting those already decided", () => {
    expect(MAX_JEV_PERSONAS_PER_MISSION).toBe(3);
    const five = ["a", "b", "c", "d", "e"].map((id, i) => bug(id, i, "alpha"));
    expect(
      personaJevConfigurations(mission(five), personaOf).map(
        (c) => c.payload.unitId,
      ),
    ).toEqual(["a", "b", "c"]);
    // Two already decided (one of them since killed) leave room for one.
    const decided = mission(
      [bug("x", 0, "alpha", { hp: 0 }), bug("y", 1, "sovereign"), ...five],
      {
        entities: {
          x: { enabled: true, entityPrompt: "" },
          y: { enabled: false, entityPrompt: "" },
        },
        commanders: { tdf: "", bugs: "" },
      },
    );
    expect(
      personaJevConfigurations(decided, personaOf).map((c) => c.payload.unitId),
    ).toEqual(["a"]);
  });

  it("preserves the bugs' commander prompt when one is set, and never writes over the TDF's", () => {
    const [command] = personaJevConfigurations(
      mission([bug("mother", 0, "broodmother")], {
        entities: {},
        commanders: { tdf: "Hold the line.", bugs: "Swarm the mechs." },
      }),
      personaOf,
    );
    expect(command?.payload.commanderPrompt).toBe("Swarm the mechs.");
  });

  it("with no bug commander prompt, the first persona's becomes the faction's for every one after it", () => {
    const commands = personaJevConfigurations(
      mission([bug("sov", 0, "sovereign"), bug("mother", 1, "broodmother")]),
      personaOf,
    );
    expect(commands.map((c) => c.payload.commanderPrompt)).toEqual([
      PERSONAS.sovereign.commanderPrompt,
      PERSONAS.sovereign.commanderPrompt,
    ]);
    expect(commands.map((c) => c.payload.control.entityPrompt)).toEqual([
      PERSONAS.sovereign.entityPrompt,
      PERSONAS.broodmother.entityPrompt,
    ]);
  });

  it("owes nothing to a finished mission or for a persona this build does not know", () => {
    const over = {
      ...mission([bug("mother", 0, "broodmother")]),
      outcome: "lost" as const,
    };
    expect(personaJevConfigurations(over, personaOf)).toEqual([]);
    const unknown = mission([
      { ...bug("future", 0), persona: "queen" as PersonaId },
    ]);
    expect(personaJevConfigurations(unknown, personaOf)).toEqual([]);
  });
});

describe("JevDefaultPolicy", () => {
  it("configures persona bugs at start, before any End Turn, through ConfigureJev", () => {
    const { store, dispatched } = storeWith(
      mission([
        squad("tdf", 0),
        bug("swarm", 1),
        bug("mother", 2, "broodmother"),
      ]),
    );
    policyOver(store).start();
    expect(dispatched.map((c) => c.payload.unitId)).toEqual(["mother"]);
    const jev = store.getState().activeMission?.jev;
    expect(jev?.entities.mother).toEqual({
      enabled: true,
      entityPrompt: PERSONAS.broodmother.entityPrompt,
    });
    expect(jev?.entities.swarm).toBeUndefined();
    expect(jev?.commanders).toEqual({
      tdf: "",
      bugs: PERSONAS.broodmother.commanderPrompt,
    });
  });

  it("does nothing when the relay is not configured", () => {
    const { store, dispatched } = storeWith(
      mission([bug("mother", 0, "broodmother")]),
    );
    policyOver(store, { configured: false }).start();
    expect(dispatched).toEqual([]);
    expect(store.getState().activeMission?.jev).toBeUndefined();
  });

  it("does nothing while the preference is off, and configures new actors once it is on again", () => {
    let on = false;
    const { store, dispatched } = storeWith(
      mission([bug("mother", 0, "broodmother")]),
    );
    const policy = policyOver(store, { enabled: () => on });
    policy.start();
    expect(dispatched).toEqual([]);
    on = true;
    // The next store change (any command, a load) brings it in.
    store.replaceState(store.getState());
    expect(dispatched.map((c) => c.payload.unitId)).toEqual(["mother"]);
  });

  it("is idempotent: a configured unit is never configured again, however often it applies", () => {
    const { store, dispatched } = storeWith(
      mission([
        bug("a", 0, "alpha"),
        bug("b", 1, "alpha"),
        bug("c", 2, "alpha"),
      ]),
    );
    const policy = policyOver(store);
    policy.start();
    // Each dispatch notified the policy's own listener mid-loop; the
    // nested apply must not have configured anything twice.
    expect(dispatched.map((c) => c.payload.unitId)).toEqual(["a", "b", "c"]);
    expect(policy.apply()).toBe(0);
    store.replaceState(store.getState());
    expect(dispatched).toHaveLength(3);
  });

  it("configures a persona that arrives later, and stops at the cap for the mission", () => {
    const { store, dispatched } = storeWith(
      mission([bug("a", 0, "alpha"), bug("b", 1, "alpha")]),
    );
    policyOver(store).start();
    expect(dispatched).toHaveLength(2);
    // A hatch brings two more persona bugs in: one fits under the cap.
    const state = store.getState();
    const active = state.activeMission!;
    store.replaceState({
      ...state,
      activeMission: {
        ...active,
        units: [
          ...active.units,
          bug("c", 3, "broodmother"),
          bug("d", 4, "sovereign"),
        ],
      },
    });
    expect(dispatched.map((c) => c.payload.unitId)).toEqual(["a", "b", "c"]);
    // The later arrival keeps the commander prompt the first one set.
    expect(dispatched[2]?.payload.commanderPrompt).toBe(
      PERSONAS.alpha.commanderPrompt,
    );
  });

  it("does not touch a unit the player or a save already decided on, even when disabled", () => {
    const { store, dispatched } = storeWith(
      mission([bug("mother", 0, "broodmother")], {
        entities: { mother: { enabled: false, entityPrompt: "Stay put." } },
        commanders: { tdf: "", bugs: "" },
      }),
    );
    policyOver(store).start();
    expect(dispatched).toEqual([]);
  });

  it("stops observing once disposed", () => {
    const { store, dispatched } = storeWith(mission([bug("swarm", 0)]));
    const policy = policyOver(store);
    policy.start();
    policy.dispose();
    const state = store.getState();
    store.replaceState({
      ...state,
      activeMission: {
        ...state.activeMission!,
        units: [...state.activeMission!.units, bug("mother", 1, "broodmother")],
      },
    });
    expect(dispatched).toEqual([]);
  });
});
