import { describe, expect, it } from "vitest";

import { commandError } from "../../core/model/command-error";
import type { IdGeneratorState } from "../../core/model/id-generator";
import { err, ok } from "../../core/model/result";
import type { RngState } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { CampaignState } from "../model/campaign-state";
import { UNKNOWN_COMMAND } from "../model/command-dispatcher";
import type { CommandHandler } from "../model/command-handler";
import type { MetaServiceRestorer } from "../model/meta-service-restorer";
import type { AdvanceDayCommand } from "../model/overworld-command";
import { ADVANCE_DAY, advanceDay } from "../model/overworld-command";
import { DAY_ADVANCED } from "../model/overworld-domain-event";
import {
  OverworldCommandDispatcher,
  createOverworldCommandDispatcher,
} from "./command-dispatcher";
import { DefaultMetaServiceRestorer } from "./meta-service-restorer";

// ===========================================
// Fixtures
// ===========================================

const BASE: CampaignState = {
  meta: {
    rng: new Mulberry32Rng(42).getState(),
    ids: new SequentialIdGenerator().getState(),
  },
  overworld: {
    day: 1,
    map: { regions: [], cities: [] },
    threat: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
  },
  roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
  economy: { credits: 5000, ledger: [] },
};

/** Bumps the day and reports it; touches neither rng nor ids. */
const bumpDay: CommandHandler<CampaignState, AdvanceDayCommand> = (state) => {
  const from = state.overworld.day;
  return ok({
    state: { ...state, overworld: { ...state.overworld, day: from + 1 } },
    events: [{ type: DAY_ADVANCED, payload: { from, to: from + 1 } }],
  });
};

/** Draws one id and one number so the write-back is observable. */
const drawServices: CommandHandler<CampaignState, AdvanceDayCommand> = (
  state,
  _command,
  ctx,
) => {
  const id = ctx.ids.nextId("mission");
  const roll = ctx.rng.nextInt(1, 1000);
  return ok({
    state: { ...state, overworld: { ...state.overworld, threat: roll } },
    events: [{ type: DAY_ADVANCED, payload: { from: 0, to: id.length } }],
  });
};

/** Consumes services and then refuses. */
const drawThenFail: CommandHandler<CampaignState, AdvanceDayCommand> = (
  _state,
  _command,
  ctx,
) => {
  ctx.ids.nextId("mission");
  ctx.rng.next();
  return err(commandError("campaign-over", "The campaign has ended"));
};

/** Records what it was asked to restore, delegating to the default. */
class RecordingRestorer implements MetaServiceRestorer {
  readonly rngSnapshots: RngState[] = [];
  readonly idSnapshots: IdGeneratorState[] = [];
  private readonly inner = new DefaultMetaServiceRestorer();

  restoreRng(snapshot: RngState) {
    this.rngSnapshots.push(snapshot);
    return this.inner.restoreRng(snapshot);
  }

  restoreIds(snapshot: IdGeneratorState) {
    this.idSnapshots.push(snapshot);
    return this.inner.restoreIds(snapshot);
  }
}

// ===========================================
// Tests
// ===========================================

describe("OverworldCommandDispatcher", () => {
  it("routes a command to its registered handler and returns its outcome", () => {
    const dispatcher = createOverworldCommandDispatcher<CampaignState>();
    dispatcher.register(ADVANCE_DAY, bumpDay);

    const result = dispatcher.process(BASE, advanceDay());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.overworld.day).toBe(2);
    expect(result.value.events).toEqual([
      { type: DAY_ADVANCED, payload: { from: 1, to: 2 } },
    ]);
    expect(BASE.overworld.day).toBe(1);
  });

  it("restores rng and ids from meta and writes their advanced states back", () => {
    const dispatcher = createOverworldCommandDispatcher<CampaignState>();
    dispatcher.register(ADVANCE_DAY, drawServices);

    const first = dispatcher.process(BASE, advanceDay());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.state.meta.ids.counters).toEqual({ mission: 2 });
    expect(first.value.state.meta.rng).not.toEqual(BASE.meta.rng);
    expect(first.value.state.meta.rng.seed).toBe(BASE.meta.rng.seed);

    const second = dispatcher.process(first.value.state, advanceDay());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.state.meta.ids.counters).toEqual({ mission: 3 });
    expect(second.value.state.meta.rng).not.toEqual(first.value.state.meta.rng);
  });

  it("is deterministic for the same state and command", () => {
    const dispatcher = createOverworldCommandDispatcher<CampaignState>();
    dispatcher.register(ADVANCE_DAY, drawServices);

    expect(dispatcher.process(BASE, advanceDay())).toEqual(
      dispatcher.process(BASE, advanceDay()),
    );
  });

  it("leaves meta deep-equal when the handler draws nothing", () => {
    const dispatcher = createOverworldCommandDispatcher<CampaignState>();
    dispatcher.register(ADVANCE_DAY, bumpDay);

    const result = dispatcher.process(BASE, advanceDay());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.meta).toEqual(BASE.meta);
  });

  it("rejects an unknown command with a typed error instead of throwing", () => {
    const dispatcher = createOverworldCommandDispatcher<CampaignState>();

    const result = dispatcher.process(BASE, advanceDay());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(UNKNOWN_COMMAND);
    expect(result.error.message).toContain(ADVANCE_DAY);
  });

  it("throws on duplicate registration", () => {
    const dispatcher = createOverworldCommandDispatcher<CampaignState>();
    dispatcher.register(ADVANCE_DAY, bumpDay);

    expect(() => {
      dispatcher.register(ADVANCE_DAY, drawServices);
    }).toThrow(/Duplicate handler for command "overworld:advance-day"/);
  });

  it("propagates a handler's error unchanged and writes nothing back", () => {
    const dispatcher = createOverworldCommandDispatcher<CampaignState>();
    dispatcher.register(ADVANCE_DAY, drawThenFail);

    const result = dispatcher.process(BASE, advanceDay());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "campaign-over",
      message: "The campaign has ended",
    });
    expect(BASE.meta.ids.counters).toEqual({});
  });

  it("rebuilds services through the injected restorer from the incoming meta", () => {
    const restorer = new RecordingRestorer();
    const dispatcher = new OverworldCommandDispatcher<CampaignState>(restorer);
    dispatcher.register(ADVANCE_DAY, bumpDay);

    dispatcher.process(BASE, advanceDay());

    expect(restorer.rngSnapshots).toEqual([BASE.meta.rng]);
    expect(restorer.idSnapshots).toEqual([BASE.meta.ids]);
  });

  it("does not touch the restorer for an unknown command", () => {
    const restorer = new RecordingRestorer();
    const dispatcher = new OverworldCommandDispatcher<CampaignState>(restorer);

    dispatcher.process(BASE, advanceDay());

    expect(restorer.rngSnapshots).toEqual([]);
    expect(restorer.idSnapshots).toEqual([]);
  });
});
