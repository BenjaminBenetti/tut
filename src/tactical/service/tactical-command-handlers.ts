import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { CommandHandler } from "../../overworld/model/command-handler";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type {
  TacticalCommand,
  TacticalCommandFor,
  TacticalCommandType,
} from "../model/tactical-command";
import { describeTacticalError } from "../model/tactical-error";
import type {
  TacticalContext,
  TacticalHandler,
  TacticalOutcome,
} from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { withVision } from "./vision-service";

// ===========================================
// Types
// ===========================================

/**
 * The pure handlers to put on the campaign dispatcher, one per tactical
 * command type. Partial so the rules land incrementally: a type without
 * a handler is simply not registered and dispatches as `unknown-command`.
 */
export type TacticalHandlers = {
  readonly [TType in TacticalCommandType]?: TacticalHandler<
    TacticalCommandFor<TType>
  >;
};

/** `CommandError.code` when a tactical command arrives with no mission in progress. */
export const NO_ACTIVE_MISSION = "no-active-mission";

/** `CommandError.code` when a tactical command arrives after the mission has ended. */
export const MISSION_OVER = "mission-over";

// ===========================================
// Applying
// ===========================================

/**
 * Applies one command to a mission through the pure handlers, without
 * the campaign store: the processor the bug phase (#335) and the
 * headless sim (#343) drive. A command whose type has no handler is
 * refused with `unhandled-command` rather than thrown, since which rules
 * have landed is configuration, not a bug in the caller.
 *
 * ```
 *   handlers[command.type] ──undefined──► err unhandled-command
 *          │
 *          └──► handler(mission, command, ctx) ──► ok { state, events } | err
 * ```
 */
export function applyTacticalCommand(
  handlers: TacticalHandlers,
  mission: TacticalState,
  command: TacticalCommand,
  ctx: TacticalContext,
): TacticalOutcome {
  // The mapped type pairs each key with its own command's handler; the
  // lookup is by the command's own tag, so widening to the union is safe.
  const handler = handlers[command.type] as TacticalHandler | undefined;
  if (handler === undefined) {
    return err({ kind: "unhandled-command", commandType: command.type });
  }
  return handler(mission, command, ctx);
}

// ===========================================
// Lifting
// ===========================================

/**
 * Adapts a pure tactical handler to the campaign dispatcher's shape:
 * lifts `activeMission` out of the campaign, hands the handler a stream
 * forked for this one command, and writes the mission back with the new
 * events appended to its log. A command with no mission in progress is
 * rejected with `no-active-mission`, one after the mission has ended
 * with `mission-over`; a handler's `TacticalError` becomes a
 * `CommandError` whose `code` is the error's `kind`.
 *
 * ```
 *   state.activeMission ──undefined──► err no-active-mission
 *          │
 *   mission.outcome ──────set──────► err mission-over
 *          │
 *   handler(mission, command, { rng: fork(label), ids })
 *          ├── err ──► CommandError(kind, message)   (nothing written back)
 *          └── ok  ──► { ...state, activeMission: { ...mission', log: [...log, ...events] } }, events
 * ```
 *
 * The fork label carries the mission, turn, phase, log length and command
 * type, so two attacks in one turn roll different streams while a replay
 * of the same commands from the same save rolls the same ones.
 */
export function liftTacticalHandler<
  TState extends MissionCampaignState,
  TType extends TacticalCommandType,
>(
  handler: TacticalHandler<TacticalCommandFor<TType>>,
): CommandHandler<TState, TacticalCommandFor<TType>> {
  return (state, command, ctx) => {
    const mission = state.activeMission;
    if (mission === undefined) {
      return err(
        commandError(
          NO_ACTIVE_MISSION,
          describeTacticalError({ kind: "no-active-mission" }),
        ),
      );
    }
    if (mission.outcome !== undefined) {
      return err(
        commandError(
          MISSION_OVER,
          describeTacticalError({
            kind: "mission-over",
            outcome: mission.outcome,
          }),
        ),
      );
    }
    const label = [
      "tactical",
      mission.missionId,
      String(mission.turn),
      mission.phase,
      String(mission.commandSeq),
      command.type,
    ].join(":");
    const outcome = handler(mission, command, {
      rng: ctx.rng.fork(label),
      ids: ctx.ids,
    });
    if (!outcome.ok) {
      return err(
        commandError(outcome.error.kind, describeTacticalError(outcome.error)),
      );
    }
    // Vision is recomputed here and nowhere else (ADR 0006 §2.2): this
    // is the one site every handler's result already passes through, so
    // no rule can move a unit and forget to update what a side can see.
    const seen = withVision(outcome.value, mission);
    const next = seen.state;
    return ok({
      state: {
        ...state,
        activeMission: {
          ...next,
          log: [...next.log, ...seen.events],
          commandSeq: mission.commandSeq + 1,
        },
      },
      events: seen.events,
    });
  };
}

// ===========================================
// Registration
// ===========================================

/**
 * Registers every supplied tactical handler on the campaign dispatcher,
 * lifted. Called once at the composition root, like
 * `registerRosterCommands`; the rules issues add their handlers to the
 * object they pass.
 */
export function registerTacticalCommands<TState extends MissionCampaignState>(
  dispatcher: CommandDispatcher<TState>,
  handlers: TacticalHandlers,
): void {
  for (const type of Object.keys(handlers) as TacticalCommandType[]) {
    const handler = handlers[type];
    if (handler === undefined) {
      continue;
    }
    // The mapped type pairs each key with its own command's handler, so
    // widening to the union here is safe: the dispatcher routes by tag.
    dispatcher.register(
      type,
      liftTacticalHandler<TState, TacticalCommandType>(
        handler as TacticalHandler,
      ),
    );
  }
}
