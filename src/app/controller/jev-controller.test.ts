import { describe, expect, it, vi } from "vitest";
import { JevController } from "./jev-controller";
import type { JevReply, JevTransport } from "../service/jev-client";
import { GameStore } from "../service/game-store";
import { shippedTacticalHandlers } from "../service/tactical-composition";
import { campaignOnDay } from "../../ui/view/mission-fixtures.test-helper";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import type { GameState } from "../../save/model/game-state";
import { registerTacticalCommands } from "../../tactical/service/tactical-command-handlers";
import {
  missionWith,
  unitAt,
  openField,
  FIXTURE_TEMPLATES,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { withVision } from "../../tactical/service/vision-service";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { configureJev, jevAct } from "../../tactical/model/jev-command";
import { overwatch } from "../../tactical/model/overwatch-command";
import { endTurn } from "../../tactical/model/end-turn-command";
import { jevFinished } from "../../tactical/service/jev-control-service";
import type { JevRequest } from "../../tactical/model/jev-control";

function reply(request: JevRequest, pick = "finish"): JevReply {
  const criteria = request.questions.action!.criteria;
  const choice = Object.hasOwn(criteria, pick)
    ? pick
    : Object.keys(criteria)[0]!;
  return {
    raw: { model: "test", answers: { action: { type: "choice", choice } } },
    answer: {
      choice,
      confidence: 1,
      probabilities: Object.fromEntries(
        Object.keys(criteria).map((id) => [id, id === choice ? 1 : 0]),
      ),
    },
  };
}
function setup(transport: JevTransport, state?: GameState) {
  const handlers = shippedTacticalHandlers();
  const dispatcher = createOverworldCommandDispatcher<GameState>();
  registerTacticalCommands(dispatcher, handlers);
  const units = [
    unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
    {
      ...unitAt("bug", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
      sourceId: "swarmer",
    },
    {
      ...unitAt("ordinary", "infantry", { x: 6, y: 0, z: 6 }, { team: "bugs" }),
      sourceId: "swarmer",
    },
  ];
  const mission = withVision({
    state: missionWith(openField().build(), units),
    events: [],
  }).state;
  const store = new GameStore(
    state ?? { ...campaignOnDay(1, []), activeMission: mission },
    dispatcher,
  );
  const controller = new JevController(store, transport, {
    handlers,
    combat: COMBAT_TUNING,
    equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
  });
  return { store, controller };
}
const instant = () => ({
  configured: true,
  ask: vi.fn((request: JevRequest) => Promise.resolve(reply(request))),
});

describe("Jev control", () => {
  it("sends roster identities for named orders, separately from shared unit types", async () => {
    const campaign = campaignOnDay(1, []);
    const roster = {
      ...campaign.roster,
      squads: [
        { ...campaign.roster.squads[0]!, id: "squad-alpha", name: "Alpha" },
        { ...campaign.roster.squads[0]!, id: "squad-bravo", name: "Bravo" },
      ],
      mechs: [
        { ...campaign.roster.mechs[0]!, id: "mech-hammer", name: "Hammerhead" },
      ],
    };
    const base = missionWith(openField().build(), [
      {
        ...unitAt("unit-alpha", "infantry", { x: 0, y: 0, z: 0 }),
        sourceId: "squad-alpha",
      },
      {
        ...unitAt("unit-bravo", "infantry", { x: 1, y: 0, z: 0 }),
        sourceId: "squad-bravo",
      },
      {
        ...unitAt("unit-hammer", "mech", { x: 2, y: 0, z: 0 }),
        sourceId: "mech-hammer",
      },
      unitAt("unit-bug", "infantry", { x: 3, y: 0, z: 0 }, { team: "bugs" }),
    ]);
    const templates = {
      ...base.templates,
      [FIXTURE_TEMPLATES.infantry]: {
        ...base.templates[FIXTURE_TEMPLATES.infantry]!,
        name: "Rifle Squad",
      },
      [FIXTURE_TEMPLATES.bug]: {
        ...base.templates[FIXTURE_TEMPLATES.bug]!,
        name: "Swarmer",
      },
    };
    const transport = instant();
    const { controller } = setup(transport, {
      ...campaign,
      roster,
      activeMission: withVision({
        state: { ...base, templates },
        events: [],
      }).state,
    });
    const snapshot = controller.capture("unit-bravo", {
      entity: "Follow Alpha",
      commander: "Keep Hammerhead covered",
    });
    await controller.evaluate(snapshot);
    const sent = transport.ask.mock.calls[0]?.[0].state;
    expect(sent).toMatchObject({
      entity_prompt: "Follow Alpha",
      commander_prompt: "Keep Hammerhead covered",
      actor: { id: "unit-bravo", name: "Bravo", type: "Rifle Squad" },
    });
    expect(sent?.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "unit-alpha",
          name: "Alpha",
          type: "Rifle Squad",
          position: { x: 0, y: 0, z: 0 },
        }),
        expect.objectContaining({
          id: "unit-hammer",
          name: "Hammerhead",
          type: "Mech",
        }),
        expect.objectContaining({
          id: "unit-bug",
          name: "Swarmer",
          type: "Swarmer",
          relationship: "hostile",
        }),
      ]),
    );
    expect(controller.capture("unit-hammer").state.actor).toMatchObject({
      name: "Hammerhead",
      type: "Mech",
      movement_class: "mech",
    });
    expect(controller.capture("unit-bug").state.entities).toContainEqual(
      expect.objectContaining({ name: "Alpha", relationship: "hostile" }),
    );
    controller.dispose();
  });
  it("makes no requests by default, and previews do not mutate the mission", async () => {
    const transport = instant();
    const { store, controller } = setup(transport);
    controller.start();
    await Promise.resolve();
    expect(transport.ask).not.toHaveBeenCalled();
    const before = store.getState();
    await controller.evaluate(
      controller.capture("self", { entity: "Hold", commander: "Protect" }),
    );
    expect(store.getState()).toBe(before);
    expect(controller.history[0]?.snapshot.state.entity_prompt).toBe("Hold");
    expect(controller.history[0]?.status).toBe("evaluated");
    controller.dispose();
  });
  it("plays enabled TDF entities, checkpoints completion, and does not repeat after JSON save/resume", async () => {
    const transport = instant();
    const { store, controller } = setup(transport);
    controller.configure("self", true, "Hold", "Defend");
    controller.start();
    await vi.waitFor(() =>
      expect(controller.history.at(-1)?.status).toBe("applied"),
    );
    expect(jevFinished(store.getState().activeMission!, "self")).toBe(true);
    const saved = JSON.parse(JSON.stringify(store.getState())) as GameState;
    controller.dispose();
    const nextTransport = instant();
    const resumed = setup(nextTransport, saved);
    resumed.controller.start();
    await Promise.resolve();
    expect(nextTransport.ask).not.toHaveBeenCalled();
    expect(
      resumed.store.getState().activeMission?.jev?.entities.self?.enabled,
    ).toBe(true);
    resumed.controller.dispose();
  });
  it("rejects a response when configuration changes during a request", async () => {
    let resolve!: (value: JevReply) => void;
    let request!: JevRequest;
    const ask = vi.fn((value: JevRequest) => {
      request = value;
      return new Promise<JevReply>((done) => {
        resolve = done;
      });
    });
    const { store, controller } = setup({ configured: true, ask });
    controller.configure("self", true, "Hold", "Defend");
    controller.start();
    await vi.waitFor(() => expect(ask).toHaveBeenCalled());
    store.dispatch(
      configureJev(
        "self",
        { enabled: false, entityPrompt: "Changed" },
        "Defend",
      ),
    );
    const changed = store.getState();
    resolve(reply(request));
    await vi.waitFor(() => expect(controller.history[0]?.status).toBe("stale"));
    expect(store.getState()).toBe(changed);
    controller.dispose();
  });
  it("resolves mixed Jev and ordinary bug activations and returns the player turn", async () => {
    const transport = instant();
    const { store, controller } = setup(transport);
    controller.configure("bug", true, "Guard eggs", "Defend");
    expect(store.dispatch(endTurn()).ok).toBe(true);
    expect(store.getState().activeMission?.phase).toBe("bugs");
    controller.start();
    await vi.waitFor(() =>
      expect(store.getState().activeMission?.phase).toBe("player"),
    );
    expect(store.getState().activeMission?.turn).toBe(2);
    expect(
      controller.history.some(
        (trace) =>
          trace.snapshot.unitId === "bug" && trace.status === "applied",
      ),
    ).toBe(true);
    expect(
      controller.history.some((trace) => trace.snapshot.unitId === "ordinary"),
    ).toBe(false);
    controller.dispose();
  });
  it("holds a TDF unit on service failure and records the reason and fallback", async () => {
    const { store, controller } = setup({
      configured: true,
      ask: () => Promise.reject(new Error("offline")),
    });
    controller.configure("self", true, "Hold", "Defend");
    controller.start();
    await vi.waitFor(() =>
      expect(controller.history[0]?.status).toBe("fallback"),
    );
    expect(controller.history[0]?.exchanges[0]?.error).toBe("offline");
    expect(store.getState().activeMission?.units[0]?.ap).toBe(2);
    controller.dispose();
  });
  it("resumes a partially completed bug phase without repeating the completed actor", async () => {
    const { store, controller } = setup(instant());
    controller.configure("bug", true, "Guard", "Defend");
    expect(store.dispatch(endTurn()).ok).toBe(true);
    expect(store.dispatch(endTurn()).ok).toBe(false);
    expect(
      store.dispatch(
        jevAct({
          unitId: "bug",
          expectedSeq: store.getState().activeMission!.commandSeq,
          choice: "finish",
        }),
      ).ok,
    ).toBe(true);
    const saved = JSON.parse(JSON.stringify(store.getState())) as GameState;
    controller.dispose();
    const transport = instant();
    const resumed = setup(transport, saved);
    resumed.controller.start();
    await vi.waitFor(() =>
      expect(resumed.store.getState().activeMission?.phase).toBe("player"),
    );
    expect(transport.ask).not.toHaveBeenCalled();
    expect(resumed.store.getState().activeMission?.turn).toBe(2);
    expect(resumed.store.getState().activeMission?.jev?.decisions).toHaveLength(
      1,
    );
    resumed.controller.dispose();
  });
  it("refuses stale sequences and commands belonging to another entity", () => {
    const { store, controller } = setup(instant());
    controller.configure("self", true, "Hold", "Defend");
    const before = store.getState();
    const seq = before.activeMission!.commandSeq;
    for (const payload of [
      { unitId: "self", expectedSeq: seq - 1, choice: "finish" },
      {
        unitId: "self",
        expectedSeq: seq,
        choice: "foreign-order",
        command: overwatch("bug"),
      },
    ]) {
      expect(store.dispatch(jevAct(payload)).ok).toBe(false);
      expect(store.getState()).toBe(before);
    }
    controller.dispose();
  });
  it("disposal prevents a late answer from acting", async () => {
    let resolve!: (value: JevReply) => void;
    let request!: JevRequest;
    const ask = vi.fn((value: JevRequest) => {
      request = value;
      return new Promise<JevReply>((done) => {
        resolve = done;
      });
    });
    const { store, controller } = setup({ configured: true, ask });
    controller.configure("self", true, "Hold", "Defend");
    controller.start();
    await vi.waitFor(() => expect(ask).toHaveBeenCalled());
    controller.dispose();
    const before = store.getState();
    resolve(reply(request));
    await vi.waitFor(() =>
      expect(controller.history[0]?.status).toBe("cancelled"),
    );
    expect(store.getState()).toBe(before);
  });
});

it("applies a real selected action through the same handlers as a player", async () => {
  const transport: JevTransport = {
    configured: true,
    ask: (request) => {
      const id = Object.entries(request.questions.action!.criteria).find(
        ([, description]) =>
          JSON.stringify(description).includes('"overwatch"'),
      )?.[0];
      return Promise.resolve(reply(request, id));
    },
  };
  const { store, controller } = setup(transport);
  controller.configure("self", true, "Guard", "Defend");
  controller.start();
  await vi.waitFor(() =>
    expect(controller.history.at(-1)?.status).toBe("applied"),
  );
  const unit = store.getState().activeMission!.units[0]!;
  expect(unit.ap).toBe(0);
  expect(unit.status).toContain("overwatch");
  expect(
    store.getState().activeMission!.jev!.decisions!.at(-1)?.command?.type,
  ).toBe("tactical:overwatch");
  controller.dispose();
});
