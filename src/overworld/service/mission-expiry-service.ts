import { isMissionExpired } from "../model/mission";
import type {
  MissionConsequenceContext,
  MissionConsequenceRules,
} from "../model/mission-consequence-rule";
import { MISSION_EXPIRED } from "../model/mission-expired-event";
import type {
  OverworldApplied,
  OverworldDomainEvent,
} from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";

// ===========================================
// Types
// ===========================================

/** What the expiry step asks about a lapsed offer. */
export interface MissionExpiryDeps {
  /** Each type's consequences; `onExpired` says what a lapsed offer costs. */
  readonly consequences: MissionConsequenceRules;
  /** Handed to every rule. */
  readonly context: MissionConsequenceContext;
}

// ===========================================
// Tick step: expiry
// ===========================================

/**
 * Removes every mission that has lapsed on `state.day`
 * (`isMissionExpired`: `day >= expiresDay`, and never a `pinned` one,
 * ADR 0013 §2.2) and applies each one's consequence rule. In mission
 * order, each lapsed offer emits a `MissionExpired`, then whatever its
 * type's `onExpired` changed (both shipped types add the frozen
 * `ignorePenalty` to the host city, clamped, with a
 * `CityInfestationChanged` when it moved). Returns the input state
 * untouched when nothing lapsed.
 *
 * ```
 *   missions ──► [lapsed | kept]
 *                   │ for each, in order
 *                   ├─► MissionExpired
 *                   └─► consequences[typeId].onExpired(overworld, mission) ──► its events
 * ```
 */
export function expireMissions(
  state: OverworldState,
  deps: MissionExpiryDeps,
): OverworldApplied<OverworldState> {
  const expired = state.missions.filter((mission) =>
    isMissionExpired(mission, state.day),
  );
  if (expired.length === 0) {
    return { state, events: [] };
  }

  let current: OverworldState = {
    ...state,
    missions: state.missions.filter(
      (mission) => !isMissionExpired(mission, state.day),
    ),
  };
  const events: OverworldDomainEvent[] = [];
  for (const mission of expired) {
    events.push({
      type: MISSION_EXPIRED,
      payload: {
        missionId: mission.id,
        typeId: mission.typeId,
        cityId: mission.cityId,
        ignorePenalty: mission.ignorePenalty,
      },
    });
    const applied = deps.consequences[mission.typeId].onExpired(
      current,
      mission,
      deps.context,
    );
    current = applied.state;
    events.push(...applied.events);
  }
  return { state: current, events };
}
