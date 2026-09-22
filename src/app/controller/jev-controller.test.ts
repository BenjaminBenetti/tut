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
  walledField,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { withVision } from "../../tactical/service/vision-service";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import {
  configureJev,
  jevAct,
  setJevCommanderPrompt,
} from "../../tactical/model/jev-command";
import { overwatch } from "../../tactical/model/overwatch-command";
import { endTurn } from "../../tactical/model/end-turn-command";
import {
  jevFinished,
  jevEndTurnPending,
} from "../../tactical/service/jev-control-service";
import type { JevRequest } from "../../tactical/model/jev-control";

/** Select a real action by default, reserving the remainder of an activation. */
function reply(request: JevRequest, pick = "overwatch"): JevReply {
  if (request.questions.distance)
    return {
      raw: {
        model: "test",
        answers: { distance: { type: "score", score: 4 } },
      },
      answer: {
        score: 4,
        confidence: 1,
        probabilities: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 1 },
      },
    };
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

/** Two player actors behind a wall, so the next bug turn cannot decide this fixture. */
function mixedCampaign(): GameState {
  return {
    ...campaignOnDay(1, []),
    activeMission: withVision({
      state: missionWith(walledField(), [
        unitAt("self", "infantry", { x: 0, y: 0, z: 5 }),
        unitAt("manual", "infantry", { x: 1, y: 0, z: 5 }),
        unitAt("bug", "infantry", { x: 7, y: 0, z: 5 }, { team: "bugs" }),
      ]),
      events: [],
    }).state,
  };
}

describe("Jev control", () => {
  it.each(["fresh", "disabled", "switched-off"])(
    "makes no requests across ordinary bug turns with %s controls",
    async (configuration) => {
      const transport = instant();
      const { store, controller } = setup(transport, mixedCampaign());
      if (configuration === "switched-off") {
        controller.configure("self", true, "Hold", "Defend");
        controller.configure("bug", true, "Hold", "Defend");
      }
      if (configuration !== "fresh") {
        controller.configure("self", false, "Hold", "Defend");
        controller.configure("bug", false, "Hold", "Defend");
      }
      controller.start();
      for (let turn = 1; turn <= 3; turn++) {
        expect(store.dispatch(endTurn()).ok).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(store.getState().activeMission).toMatchObject({
          phase: "player",
          turn: turn + 1,
        });
      }
      expect(transport.ask).not.toHaveBeenCalled();
      expect(controller.history).toEqual([]);
      controller.dispose();
    },
  );
  it("waits for manual animation playback before asking an enabled TDF unit", async () => {
    const transport = instant();
    const { store, controller } = setup(transport, mixedCampaign());
    controller.configure("self", true, "Hold", "Defend");
    // The screen subscribes first and raises the gate synchronously when a command animates.
    const detach = store.subscribe(() => controller.setPlaybackPending(true));
    controller.start();
    expect(store.dispatch(overwatch("manual")).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.ask).not.toHaveBeenCalled();
    controller.pause(true);
    controller.setPlaybackPending(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.ask).not.toHaveBeenCalled();
    controller.pause(false);
    await vi.waitFor(() => expect(transport.ask).toHaveBeenCalledTimes(1));
    expect(controller.history[0]?.snapshot.team).toBe("tdf");
    detach();
    controller.dispose();
  });
  it("waits between mixed bug activations and before returning the player turn", async () => {
    const transport = instant();
    const { store, controller } = setup(transport);
    controller.configure("bug", true, "Hold", "Defend");
    const commands: string[] = [];
    const detach = store.subscribe((change) => {
      if (change.kind === "command") commands.push(change.command.type);
      controller.setPlaybackPending(true);
    });
    expect(store.dispatch(endTurn()).ok).toBe(true);
    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.ask).not.toHaveBeenCalled();
    controller.setPlaybackPending(false);
    await vi.waitFor(() => expect(commands).toHaveLength(2));
    expect(commands.at(-1)).toBe("tactical:jev-act");
    expect(transport.ask).toHaveBeenCalledTimes(1);
    expect(store.getState().activeMission?.phase).toBe("bugs");
    expect(jevFinished(store.getState().activeMission!, "ordinary")).toBe(
      false,
    );
    controller.setPlaybackPending(false);
    await vi.waitFor(() => expect(commands).toHaveLength(3));
    expect(commands.at(-1)).toBe("tactical:default-bug-act");
    expect(store.getState().activeMission?.phase).toBe("bugs");
    expect(transport.ask).toHaveBeenCalledTimes(1);
    controller.setPlaybackPending(false);
    await vi.waitFor(() =>
      expect(store.getState().activeMission?.phase).toBe("player"),
    );
    expect(commands.at(-1)).toBe("tactical:end-turn");
    expect(transport.ask).toHaveBeenCalledTimes(1);
    detach();
    controller.dispose();
  });
  it("does not ask a TDF unit for the next turn while the ordinary bug phase is still animating", async () => {
    const transport = instant();
    const { store, controller } = setup(transport, mixedCampaign());
    controller.configure("self", true, "Hold", "Defend");
    store.dispatch(overwatch("manual"));
    const campaign = store.getState();
    store.replaceState({
      ...campaign,
      activeMission: {
        ...campaign.activeMission!,
        units: campaign.activeMission!.units.map((unit) =>
          unit.team === "tdf"
            ? { ...unit, maxAp: unit.id === "self" ? 2 : 0 }
            : unit,
        ),
      },
    });
    const detach = store.subscribe(() => controller.setPlaybackPending(true));
    controller.start();
    await vi.waitFor(() => expect(transport.ask).toHaveBeenCalledTimes(1));
    controller.setPlaybackPending(false);
    expect(store.dispatch(endTurn()).ok).toBe(true);
    expect(store.getState().activeMission?.phase).toBe("player");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.ask).toHaveBeenCalledTimes(1);
    controller.setPlaybackPending(false);
    await vi.waitFor(() => expect(transport.ask).toHaveBeenCalledTimes(2));
    expect(controller.history.map((trace) => trace.snapshot.team)).toEqual([
      "tdf",
      "tdf",
    ]);
    detach();
    controller.dispose();
  });
  it("waits for manual AP, then executes actions needing no target without a redundant question", async () => {
    const transport = {
      configured: true,
      ask: vi.fn((request: JevRequest) => {
        const criteria = request.questions.action!.criteria;
        const choice = Object.hasOwn(criteria, "overwatch")
          ? "overwatch"
          : Object.keys(criteria)[0]!;
        return Promise.resolve(reply(request, choice));
      }),
    };
    const { store, controller } = setup(transport, mixedCampaign());
    controller.configure("self", true, "Guard", "Defend");
    controller.start();
    await vi.waitFor(() => expect(controller.history).toHaveLength(0));
    await Promise.resolve();
    expect(transport.ask).not.toHaveBeenCalled();
    expect(store.dispatch(overwatch("manual")).ok).toBe(true);
    await vi.waitFor(() =>
      expect(controller.history[0]?.status).toBe("applied"),
    );
    expect(transport.ask).toHaveBeenCalledTimes(1);
    const [first] = transport.ask.mock.calls.map(([request]) => request);
    expect(first!.questions.action!.criteria).toHaveProperty("move");
    expect(first!.questions.action!.criteria).toHaveProperty("overwatch");
    expect(
      controller.history[0]?.exchanges.map((exchange) => exchange.stage),
    ).toEqual(["action-type"]);
    expect(
      controller.history[0]?.exchanges.every(
        (exchange) => exchange.requestBytes > 0,
      ),
    ).toBe(true);
    expect(store.getState().activeMission).toMatchObject({
      phase: "player",
      turn: 1,
    });
    controller.dispose();
  });
  it("delays End Turn until Jev finishes, refuses duplicate/manual orders, then advances exactly once", async () => {
    let release!: () => void;
    const transport = {
      configured: true,
      ask: vi.fn(
        (request: JevRequest) =>
          new Promise<JevReply>((resolve) => {
            release = () => resolve(reply(request));
          }),
      ),
    };
    const { store, controller } = setup(transport, mixedCampaign());
    controller.configure("self", true, "Hold", "Defend");
    controller.start();
    expect(store.dispatch(endTurn()).ok).toBe(true);
    expect(jevEndTurnPending(store.getState().activeMission!)).toBe(true);
    expect(store.getState().activeMission).toMatchObject({
      phase: "player",
      turn: 1,
    });
    await vi.waitFor(() => expect(transport.ask).toHaveBeenCalledTimes(1));
    const pending = store.getState();
    expect(store.dispatch(endTurn()).ok).toBe(false);
    expect(store.dispatch(overwatch("manual")).ok).toBe(false);
    expect(store.getState()).toBe(pending);
    release();
    await vi.waitFor(() =>
      expect(store.getState().activeMission?.turn).toBe(2),
    );
    expect(store.getState().activeMission?.phase).toBe("player");
    expect(jevEndTurnPending(store.getState().activeMission!)).toBe(false);
    expect(transport.ask).toHaveBeenCalledTimes(1);
    expect(store.getState().activeMission?.jev?.decisions).toHaveLength(1);
    controller.dispose();
  });
  it("resumes a saved pending End Turn without repeating completed Jev units", async () => {
    const base = mixedCampaign();
    const transport = instant();
    const { store, controller } = setup(transport, {
      ...base,
      activeMission: {
        ...base.activeMission!,
        units: [
          ...base.activeMission!.units,
          unitAt("second", "infantry", { x: 2, y: 0, z: 5 }),
        ],
      },
    });
    controller.configure("self", true, "Hold", "Defend");
    controller.configure("second", true, "Hold", "Defend");
    expect(store.dispatch(endTurn()).ok).toBe(true);
    expect(
      store.dispatch(
        jevAct({
          unitId: "self",
          expectedSeq: store.getState().activeMission!.commandSeq,
          choice: "finish",
        }),
      ).ok,
    ).toBe(true);
    const saved = JSON.parse(JSON.stringify(store.getState())) as GameState;
    controller.dispose();
    const resumed = setup(transport, saved);
    resumed.controller.start();
    await vi.waitFor(() =>
      expect(resumed.store.getState().activeMission?.turn).toBe(2),
    );
    expect(
      resumed.controller.history.map((trace) => trace.snapshot.unitId),
    ).toEqual(["second"]);
    expect(resumed.store.getState().activeMission?.jev?.decisions).toHaveLength(
      2,
    );
    resumed.controller.dispose();
  });
  it("still completes a pending End Turn if Jev fails", async () => {
    const { store, controller } = setup(
      { configured: true, ask: () => Promise.reject(new Error("offline")) },
      mixedCampaign(),
    );
    controller.configure("self", true, "Hold", "Defend");
    store.dispatch(endTurn());
    controller.start();
    await vi.waitFor(() =>
      expect(store.getState().activeMission?.turn).toBe(2),
    );
    expect(controller.history[0]?.status).toBe("fallback");
    controller.dispose();
  });
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
    const capabilities = sent?.capabilities as Record<
      string,
      Record<string, unknown>
    >;
    const entities = (sent?.entities as Record<string, unknown>[]).map(
      (entity) => ({
        ...capabilities[entity.capability_ref as string],
        ...entity,
      }),
    );
    expect(entities).toEqual(
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
    expect(transport.ask).toHaveBeenCalledTimes(1);
    await controller.step(controller.history[0]!.id);
    expect(controller.history[0]?.status).toBe("evaluated");
    expect(transport.ask).toHaveBeenCalledTimes(1);
    expect(store.getState()).toBe(before);
    await controller.step(controller.history[0]!.id);
    expect(transport.ask).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
  it("steps through grouped previews once per click with frozen inputs, even after the live mission changes", async () => {
    const transport = {
      configured: true,
      ask: vi.fn((request: JevRequest) =>
        Promise.resolve(reply(request, "move")),
      ),
    };
    const { store, controller } = setup(transport);
    const captured = controller.capture("self", {
      entity: "Advance",
      commander: "Cover",
    });
    const snapshot = {
      ...captured,
      candidates: Array.from({ length: 100 }, (_, index) => ({
        id: `move-${String(index)}`,
        category: "move",
        description: `Move option ${String(index)}`,
      })),
    };
    await controller.evaluate(snapshot);
    const id = controller.history[0]!.id;
    expect(transport.ask).toHaveBeenCalledTimes(1);
    expect(controller.history[0]).toMatchObject({
      status: "ready",
      next: { stage: "action-group" },
    });
    expect(store.dispatch(overwatch("self")).ok).toBe(true);
    const after = store.getState();
    await Promise.all([controller.step(id), controller.step(id)]);
    expect(transport.ask).toHaveBeenCalledTimes(2);
    expect(controller.history[0]).toMatchObject({
      status: "ready",
      next: { stage: "action" },
    });
    await controller.step(id);
    expect(transport.ask).toHaveBeenCalledTimes(3);
    expect(controller.history[0]?.status).toBe("evaluated");
    expect(controller.history[0]?.next).toBeUndefined();
    expect(controller.history[0]?.exchanges.map((item) => item.stage)).toEqual([
      "action-type",
      "action-group",
      "action",
    ]);
    for (const [request] of transport.ask.mock.calls)
      expect(request.state).toEqual(snapshot.state);
    expect(store.getState()).toBe(after);
    controller.dispose();
  });
  it("makes no preview or automatic requests for actors without AP or available actions", async () => {
    const transport = instant();
    const { store, controller } = setup(transport);
    const original = controller.capture("self");
    await controller.evaluate({ ...original, candidates: [] });
    expect(controller.history.at(-1)?.status).toBe("skipped");
    expect(store.dispatch(overwatch("self")).ok).toBe(true);
    controller.configure("self", true, "Guard", "Defend");
    controller.start();
    const spent = controller.capture("self");
    expect(spent.candidates).toEqual([]);
    await controller.evaluate(spent);
    await controller.step(controller.history.at(-1)!.id);
    expect(controller.history.at(-1)?.status).toBe("skipped");
    expect(transport.ask).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("retains both responses when a preview follow-up fails and does not retry on another step", async () => {
    const transport = {
      configured: true,
      ask: vi.fn((request: JevRequest) =>
        Promise.resolve(reply(request, "move")),
      ),
    };
    const { store, controller } = setup(transport);
    const before = store.getState();
    await controller.evaluate(controller.capture("self"));
    const id = controller.history[0]!.id;
    transport.ask.mockRejectedValueOnce(new Error("relay unavailable"));
    await controller.step(id);
    expect(controller.history[0]).toMatchObject({
      status: "failed",
      detail: "relay unavailable",
      exchanges: [
        { stage: "action-type", answer: { choice: "move" } },
        { stage: "movement-target", error: "relay unavailable" },
      ],
    });
    expect(controller.history[0]?.next).toBeUndefined();
    await controller.step(id);
    expect(transport.ask).toHaveBeenCalledTimes(2);
    expect(store.getState()).toBe(before);
    controller.dispose();
  });
  it("steps through movement target and distance, preserving all metadata and rounding the recorded command", async () => {
    const transport = {
      configured: true,
      ask: vi.fn((request: JevRequest) =>
        Promise.resolve(
          request.questions.distance
            ? {
                ...reply(request),
                answer: {
                  score: 2,
                  confidence: 1,
                  probabilities: { "0": 0, "1": 0, "2": 1, "3": 0, "4": 0 },
                },
              }
            : reply(
                request,
                Object.hasOwn(request.questions.action!.criteria, "move")
                  ? "move"
                  : "move_east",
              ),
        ),
      ),
    };
    const { store, controller } = setup(transport);
    const snapshot = controller.capture("self", {
      entity: "Advance east",
      commander: "Stay alive",
    });
    const before = store.getState();
    await controller.evaluate(snapshot);
    const id = controller.history[0]!.id;
    expect(controller.history[0]?.next?.stage).toBe("movement-target");
    await controller.step(id);
    expect(transport.ask).toHaveBeenCalledTimes(2);
    const next = controller.history[0]!.next!;
    expect(next.stage).toBe("movement-distance");
    expect(next.request.state).toMatchObject(snapshot.state);
    expect(next.request.state.selected_movement).toMatchObject({
      intent: "move_east",
      available_distance: 3,
    });
    expect(controller.history[0]?.candidate).toBeUndefined();
    await Promise.all([controller.step(id), controller.step(id)]);
    expect(transport.ask).toHaveBeenCalledTimes(3);
    expect(controller.history[0]).toMatchObject({
      status: "evaluated",
      candidate: {
        command: {
          type: "tactical:move",
          payload: {
            path: [
              { x: 1, y: 0, z: 0 },
              { x: 2, y: 0, z: 0 },
            ],
          },
        },
      },
    });
    expect(
      controller.history[0]!.exchanges.map((entry) => entry.stage),
    ).toEqual(["action-type", "movement-target", "movement-distance"]);
    expect(store.getState()).toBe(before);
    controller.dispose();
  });
  it("retains a failed distance request and never exposes an unscored move for execution", async () => {
    const transport = {
      configured: true,
      ask: vi.fn((request: JevRequest) =>
        request.questions.distance
          ? Promise.reject(new Error("distance unavailable"))
          : Promise.resolve(reply(request, "move")),
      ),
    };
    const { store, controller } = setup(transport);
    const before = store.getState();
    await controller.evaluate(controller.capture("self"));
    const id = controller.history[0]!.id;
    await controller.step(id);
    await controller.step(id);
    await controller.step(id);
    expect(transport.ask).toHaveBeenCalledTimes(3);
    expect(controller.history[0]).toMatchObject({
      status: "failed",
      detail: "distance unavailable",
    });
    expect(controller.history[0]?.candidate).toBeUndefined();
    expect(controller.history[0]?.exchanges[2]).toMatchObject({
      stage: "movement-distance",
      error: "distance unavailable",
    });
    expect(store.getState()).toBe(before);
    controller.dispose();
  });
  it("recaptures position, AP and vision after each one-AP move and stops requesting at zero AP", async () => {
    const transport = {
      configured: true,
      ask: vi.fn((request: JevRequest) =>
        Promise.resolve(
          reply(
            request,
            request.questions.action &&
              Object.hasOwn(request.questions.action.criteria, "move")
              ? "move"
              : "move_east",
          ),
        ),
      ),
    };
    const { store, controller } = setup(transport, {
      ...campaignOnDay(1, []),
      activeMission: withVision({
        state: missionWith(openField().build(), [
          unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
          unitAt("enemy", "infantry", { x: 7, y: 0, z: 3 }, { team: "bugs" }),
        ]),
        events: [],
      }).state,
    });
    controller.configure("self", true, "Advance", "Scout");
    controller.start();
    await vi.waitFor(() =>
      expect(store.getState().activeMission!.units[0]!.ap).toBe(0),
    );
    expect(controller.history).toHaveLength(2);
    expect(transport.ask).toHaveBeenCalledTimes(6);
    const [first, second] = controller.history;
    expect(first!.snapshot.state.actor).toMatchObject({
      ap: 2,
      position: { x: 0, y: 0, z: 0 },
    });
    expect(second!.snapshot.state.actor).toMatchObject({
      ap: 1,
      position: { x: 3, y: 0, z: 0 },
    });
    expect(second!.snapshot.commandSeq).toBeGreaterThan(
      first!.snapshot.commandSeq,
    );
    expect(first!.snapshot.state.entities).not.toEqual(
      second!.snapshot.state.entities,
    );
    expect(store.getState().activeMission!.units[0]!.pos).toEqual({
      x: 6,
      y: 0,
      z: 0,
    });
    expect(
      controller.history.every((trace) => trace.status === "applied"),
    ).toBe(true);
    expect(jevFinished(store.getState().activeMission!, "self")).toBe(true);
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
  it("saves shared TDF orders without enabling units or spending AP, and restores them on load", async () => {
    const transport = instant();
    const { store, controller } = setup(transport, mixedCampaign());
    const original = store.getState().activeMission!;
    expect(
      store.dispatch(setJevCommanderPrompt("bugs", "Guard the nests")).ok,
    ).toBe(true);
    expect(
      store.dispatch(setJevCommanderPrompt("tdf", "Follow Alpha")).ok,
    ).toBe(true);
    const saved = store.getState().activeMission!;
    expect(saved.units).toEqual(original.units);
    expect(saved.jev?.entities).toEqual({});
    expect(saved.jev?.commanders).toEqual({
      tdf: "Follow Alpha",
      bugs: "Guard the nests",
    });
    for (const unit of saved.units.filter((unit) => unit.team === "tdf"))
      expect(controller.capture(unit.id).state.commander_prompt).toBe(
        "Follow Alpha",
      );
    controller.start();
    await Promise.resolve();
    expect(transport.ask).not.toHaveBeenCalled();
    controller.dispose();
    const loaded = setup(
      instant(),
      JSON.parse(JSON.stringify(store.getState())) as GameState,
    );
    expect(loaded.controller.capture("self").state.commander_prompt).toBe(
      "Follow Alpha",
    );
    expect(
      loaded.store.dispatch(setJevCommanderPrompt("tdf", "x".repeat(8001))).ok,
    ).toBe(false);
    expect(loaded.controller.capture("self").state.commander_prompt).toBe(
      "Follow Alpha",
    );
    expect(loaded.store.dispatch(setJevCommanderPrompt("tdf", "")).ok).toBe(
      true,
    );
    expect(loaded.controller.capture("self").state.commander_prompt).toBe("");
    loaded.controller.dispose();
  });
  it("replaces orders during a pending End Turn and discards the old response without spending AP", async () => {
    const pending: {
      request: JevRequest;
      resolve: (reply: JevReply) => void;
    }[] = [];
    const ask = vi.fn(
      (request: JevRequest) =>
        new Promise<JevReply>((resolve) => pending.push({ request, resolve })),
    );
    const { store, controller } = setup(
      { configured: true, ask },
      mixedCampaign(),
    );
    controller.configure("self", true, "Stay alive", "Hold position");
    expect(store.dispatch(endTurn()).ok).toBe(true);
    const before = store.getState().activeMission!;
    expect(jevEndTurnPending(before)).toBe(true);
    controller.start();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    expect(
      store.dispatch(setJevCommanderPrompt("tdf", "Follow Alpha")).ok,
    ).toBe(true);
    const changed = store.getState().activeMission!;
    expect(changed.jev?.entities).toEqual(before.jev?.entities);
    expect(changed.jev?.activation).toEqual(before.jev?.activation);
    pending[0]!.resolve(reply(pending[0]!.request));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(controller.history[0]?.status).toBe("stale");
    expect(pending[1]!.request.state.commander_prompt).toBe("Follow Alpha");
    expect(store.getState().activeMission!.units).toEqual(before.units);
    controller.dispose();
    pending[1]!.resolve(reply(pending[1]!.request));
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
