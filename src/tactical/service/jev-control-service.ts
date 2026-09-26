import type { TacticalEvent } from "../model/tactical-event";
import { err, ok } from "../../core/model/result";
import type {
  TacticalHandler,
  TacticalContext,
  TacticalOutcome,
} from "../model/tactical-handler";
import type {
  ConfigureJevCommand,
  SetJevCommanderPromptCommand,
  JevActCommand,
  DefaultBugActCommand,
} from "../model/jev-command";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { TacticalCommand } from "../model/tactical-command";
import type { TacticalHandlers } from "./tactical-command-handlers";
import { applyTacticalCommand } from "./tactical-command-handlers";
import { restingBugIds } from "./dormancy-service";
import { withVision } from "./vision-service";
import { isAutonomous } from "../model/unit";
import { extract } from "../model/extract-command";
import {
  JEV_PROMPT_MAX_LENGTH,
  JEV_ACTION_OWNER_FIELDS,
} from "../model/jev-control";

/** Start a fresh serializable cursor when a phase changes, keeping the legacy path when no bug opts in. */
export function startJevPhase(mission: TacticalState): TacticalState {
  if (!mission.jev) return mission;
  return {
    ...mission,
    jev: {
      ...mission.jev,
      activation: {
        turn: mission.turn,
        phase: mission.phase,
        finished: [],
        externalBugs: mission.phase === "bugs" && hasAwakeJevBug(mission),
      },
    },
  };
}

/**
 * Whether a living, Jev-enabled bug is awake to act this phase. A
 * resting one (`restingBugIds`: a dormant brood, #1179) does not make
 * the phase external: a sleeper costs the relay nothing.
 */
function hasAwakeJevBug(mission: TacticalState): boolean {
  const resting = restingBugIds(mission);
  return mission.units.some(
    (unit) =>
      unit.team === "bugs" &&
      unit.hp > 0 &&
      !resting.has(unit.id) &&
      mission.jev?.entities[unit.id]?.enabled === true,
  );
}

/** Whether this actor has already finished in this phase. */
export function jevFinished(mission: TacticalState, unitId: string): boolean {
  const activation = mission.jev?.activation;
  return (
    activation?.turn === mission.turn &&
    activation.phase === mission.phase &&
    activation.finished.includes(unitId)
  );
}

/** A saved, explicit withdrawal may complete for free once its walk has finished playing. */
export function jevExtractionPending(
  mission: TacticalState,
  unitId: string,
): boolean {
  const activation = mission.jev?.activation;
  const actor = mission.units.find((unit) => unit.id === unitId);
  return (
    mission.phase === "player" &&
    activation?.turn === mission.turn &&
    activation.phase === mission.phase &&
    activation.pendingExtractions?.includes(unitId) === true &&
    mission.jev?.entities[unitId]?.enabled === true &&
    actor?.team === "tdf" &&
    actor.hp > 0 &&
    actor.ap === 0 &&
    !jevFinished(mission, unitId)
  );
}

/** A saved End Turn request applies only to the player phase in which it was made. */
export function jevEndTurnPending(mission: TacticalState): boolean {
  const activation = mission.jev?.activation;
  return (
    mission.phase === "player" &&
    activation?.turn === mission.turn &&
    activation.phase === mission.phase &&
    activation.endTurnRequested === true
  );
}

/** Manual actors get their whole turn before Jev TDF units, unless End Turn was requested. */
export function manualTdfHasActions(mission: TacticalState): boolean {
  return mission.units.some(
    (unit) =>
      unit.team === "tdf" &&
      unit.hp > 0 &&
      unit.ap > 0 &&
      !isAutonomous(unit) &&
      !mission.jev?.entities[unit.id]?.enabled,
  );
}

/** Remaining TDF activations that must complete before an explicitly requested End Turn. */
export function pendingJevTdf(mission: TacticalState): boolean {
  return mission.units.some(
    (unit) =>
      unit.team === "tdf" &&
      unit.hp > 0 &&
      (unit.ap > 0 || jevExtractionPending(mission, unit.id)) &&
      mission.jev?.entities[unit.id]?.enabled &&
      !jevFinished(mission, unit.id),
  );
}

/** Mark completion atomically with an action so loading cannot play an activation twice. */
function finish(mission: TacticalState, unitId: string): TacticalState {
  if (!mission.jev) return mission;
  const base =
    mission.jev.activation?.turn === mission.turn &&
    mission.jev.activation.phase === mission.phase
      ? mission
      : startJevPhase(mission);
  const jev = base.jev!;
  return {
    ...base,
    jev: {
      ...jev,
      activation: {
        ...jev.activation!,
        finished: [...new Set([...jev.activation!.finished, unitId])],
        pendingExtractions: jev.activation!.pendingExtractions?.filter(
          (id) => id !== unitId,
        ),
      },
    },
  };
}

/** Persist explicit opt-in and prompt changes. No environment reads belong in the simulation. */
export const configureJevHandler: TacticalHandler<ConfigureJevCommand> = (
  mission,
  command,
) => {
  const { unitId, control, commanderPrompt } = command.payload;
  const unit = mission.units.find((entry) => entry.id === unitId);
  if (!unit) return err({ kind: "unit-not-found", unitId });
  if (
    control.entityPrompt.length > JEV_PROMPT_MAX_LENGTH ||
    commanderPrompt.length > JEV_PROMPT_MAX_LENGTH
  )
    return err({
      kind: "systems-unavailable",
      reason: "Jev prompts must each be at most 8000 characters",
    });
  const jev = mission.jev ?? {
    entities: {},
    commanders: { tdf: "", bugs: "" },
  };
  let state: TacticalState = {
    ...mission,
    jev: {
      ...jev,
      entities: { ...jev.entities, [unitId]: control },
      commanders: { ...jev.commanders, [unit.team]: commanderPrompt },
      activation:
        jev.activation && !control.enabled
          ? {
              ...jev.activation,
              pendingExtractions: jev.activation.pendingExtractions?.filter(
                (id) => id !== unitId,
              ),
            }
          : jev.activation,
    },
  };
  if (!jev.activation) state = startJevPhase(state);
  return ok({ state, events: [] });
};

/** Update faction orders without changing entity control, AP or activation progress. */
export const setJevCommanderPromptHandler: TacticalHandler<
  SetJevCommanderPromptCommand
> = (mission, command) => {
  const { team, prompt } = command.payload;
  if (prompt.length > JEV_PROMPT_MAX_LENGTH)
    return err({
      kind: "systems-unavailable",
      reason: "Jev prompts must each be at most 8000 characters",
    });
  const jev = mission.jev ?? {
    entities: {},
    commanders: { tdf: "", bugs: "" },
  };
  return ok({
    state: {
      ...mission,
      jev: { ...jev, commanders: { ...jev.commanders, [team]: prompt } },
    },
    events: [],
  });
};

/** A selected order still passes authoritative rules and may address only its acting entity. */
export function createJevActHandler(
  handlers: TacticalHandlers,
): TacticalHandler<JevActCommand> {
  return (mission, command, ctx) => {
    const {
      unitId,
      expectedSeq,
      choice,
      command: action,
      extractOnArrival,
    } = command.payload;
    const actor = mission.units.find((unit) => unit.id === unitId);
    if (mission.commandSeq !== expectedSeq || jevFinished(mission, unitId))
      return stale();
    if (!actor || !mission.jev?.entities[unitId]?.enabled) return stale();
    if (actor.team !== TEAM_FOR_PHASE[mission.phase])
      return err({ kind: "wrong-phase", unitId });
    if (action) {
      if (!Object.hasOwn(JEV_ACTION_OWNER_FIELDS, action.type)) return stale();
      const payload = action.payload;
      const owner = (payload as unknown as Readonly<Record<string, unknown>>)[
        JEV_ACTION_OWNER_FIELDS[action.type]
      ];
      if (owner !== unitId) return stale();
    }
    const applied = action
      ? applyTacticalCommand(handlers, mission, action, ctx)
      : ok({ state: mission, events: [] });
    if (!applied.ok) return applied;
    const after = applied.value.state.units.find((unit) => unit.id === unitId);
    // Validate the free follow-up now, but save it instead of removing the unit
    // until the controller's playback gate releases the completed walk.
    const queueExtraction =
      extractOnArrival === true &&
      action?.type === "tactical:move" &&
      actor.team === "tdf" &&
      after !== undefined &&
      after.hp > 0 &&
      after.ap === 0 &&
      !applied.value.state.outcome &&
      applyTacticalCommand(handlers, applied.value.state, extract(unitId), ctx)
        .ok;
    const done =
      !action || !after || after.hp <= 0 || (after.ap <= 0 && !queueExtraction);
    const state = done
      ? finish(applied.value.state, unitId)
      : queueExtraction
        ? queueFreeExtraction(applied.value.state, unitId)
        : applied.value.state;
    return ok({
      state: {
        ...state,
        jev: {
          ...state.jev!,
          decisions: [
            ...(state.jev?.decisions ?? []),
            {
              unitId,
              turn: mission.turn,
              phase: mission.phase,
              choice,
              command: action,
              extractOnArrival,
            },
          ].slice(-128),
        },
      },
      events: applied.value.events,
    });
  };
}

/** Checkpoint an already selected zero-cost continuation so save/resume retains withdrawal intent. */
function queueFreeExtraction(
  mission: TacticalState,
  unitId: string,
): TacticalState {
  const state =
    mission.jev?.activation?.turn === mission.turn &&
    mission.jev.activation.phase === mission.phase
      ? mission
      : startJevPhase(mission);
  const jev = state.jev!;
  return {
    ...state,
    jev: {
      ...jev,
      activation: {
        ...jev.activation!,
        pendingExtractions: [
          ...new Set([...(jev.activation!.pendingExtractions ?? []), unitId]),
        ],
      },
    },
  };
}

/** Injected species planning keeps tactical services independent of concrete bug behaviours. */
export type DefaultBugPlanner = (
  mission: TacticalState,
  unitId: string,
  ctx: TacticalContext,
) => readonly TacticalCommand[];

/** Apply an ordinary bug's entire activation and checkpoint it in one command. */
export function createDefaultBugActHandler(
  handlers: TacticalHandlers,
  plan: DefaultBugPlanner,
): TacticalHandler<DefaultBugActCommand> {
  return (mission, command, ctx) => {
    const { unitId, expectedSeq } = command.payload;
    if (
      mission.phase !== "bugs" ||
      mission.commandSeq !== expectedSeq ||
      jevFinished(mission, unitId)
    )
      return stale();
    const unit = mission.units.find((entry) => entry.id === unitId);
    if (unit?.team !== "bugs") return stale();
    let state = mission;
    const events: TacticalEvent[] = [];
    for (const [index, action] of plan(mission, unitId, ctx).entries()) {
      const applied = applyTacticalCommand(handlers, state, action, {
        ...ctx,
        rng: ctx.rng.fork(`command:${String(index)}`),
      });
      if (!applied.ok) break;
      const seen = withVision(applied.value, state);
      state = seen.state;
      events.push(...seen.events);
      if (state.outcome) break;
    }
    return ok({ state: finish(state, unitId), events });
  };
}

/** Refuse stale or invalid external decisions without altering any game state. */
function stale(): TacticalOutcome {
  return err({
    kind: "systems-unavailable",
    reason: "Jev decision no longer matches this entity or turn",
  });
}
