import type {
  JevCandidate,
  JevRequest,
  JevSnapshot,
} from "../model/jev-control";
import type { TacticalState } from "../model/tactical-state";
import { PHASE_FOR_TEAM } from "../model/tactical-state";
import { jevPerception, jevState } from "./jev-observation";
import { jevCandidates } from "./jev-actions";
import type { JevActionRules } from "./jev-actions";

/** Capture an actor's exact current state; inspection does not grant AP or change the phase. */
export function captureJev(
  mission: TacticalState,
  unitId: string,
  rules: JevActionRules,
  prompts?: { readonly entity: string; readonly commander: string },
): JevSnapshot {
  const actor = mission.units.find((unit) => unit.id === unitId);
  if (!actor) throw new Error("Select a living tactical entity.");
  const view = jevPerception(mission, actor);
  const eligible =
    !mission.outcome &&
    actor.hp > 0 &&
    actor.ap > 0 &&
    mission.phase === PHASE_FOR_TEAM[actor.team];
  const state = jevState(
    mission,
    view,
    actor,
    prompts?.entity ?? mission.jev?.entities[unitId]?.entityPrompt ?? "",
    prompts?.commander ?? mission.jev?.commanders[actor.team] ?? "",
  );
  const snapshot: JevSnapshot = {
    missionId: mission.missionId,
    commandSeq: mission.commandSeq,
    unitId,
    team: actor.team,
    turn: mission.turn,
    phase: mission.phase,
    eligible,
    state: { ...state, eligible_to_act: eligible },
    candidates: eligible
      ? jevCandidates(view, actor, rules)
      : [
          {
            id: "finish",
            category: "finish",
            description:
              "No action now: the entity is dead, out of AP, the mission is over, or it is another faction's phase.",
          },
        ],
  };
  // Freeze by value, never retain references to a changing mission or prompt draft.
  return JSON.parse(JSON.stringify(snapshot)) as JevSnapshot;
}

/** A page of at most 255 choices. A group is followed by a narrower request on the same snapshot. */
export interface JevChoicePage {
  readonly request: JevRequest;
  readonly groups?: Readonly<Record<string, readonly JevCandidate[]>>;
}

/** Preserve every candidate by grouping large catalogues rather than discarding less common actions. */
export function jevChoicePage(
  snapshot: JevSnapshot,
  candidates: readonly JevCandidate[] = snapshot.candidates,
): JevChoicePage {
  const instructions =
    "Choose the next action for `actor` using only the observed and remembered facts in `state`. Follow `commander_prompt` for faction priorities and `entity_prompt` for this entity's role and tactics; commander priorities win explicit conflicts. Unknown enemies and terrain must not be assumed known. Consider objectives, AP, weapons, cover, hazards, survival and friendly fire. A historical sighting is not a current target. Choose finish if no offered action is useful or the actor is ineligible.";
  if (candidates.length <= 255)
    return {
      request: {
        model: "jev-latest",
        state: snapshot.state,
        questions: {
          action: {
            type: "choice",
            instructions,
            criteria: Object.fromEntries(
              candidates.map((candidate) => [
                candidate.id,
                describeCandidate(candidate),
              ]),
            ),
          },
        },
      },
    };
  const families = new Map<string, JevCandidate[]>();
  for (const candidate of candidates) {
    const command = candidate.command;
    const pos =
      command &&
      ("tile" in command.payload
        ? command.payload.tile
        : "path" in command.payload
          ? command.payload.path.at(-1)
          : undefined);
    const region = pos
      ? ` near x=${String(Math.floor(pos.x / 8) * 8)}..${String(Math.floor(pos.x / 8) * 8 + 7)}, z=${String(Math.floor(pos.z / 8) * 8)}..${String(Math.floor(pos.z / 8) * 8 + 7)}, y=${String(pos.y)}`
      : "";
    const family = candidate.category + region;
    const group = families.get(family) ?? [];
    group.push(candidate);
    families.set(family, group);
  }
  // If a single category/region is still large, split it into complete pages.
  const entries = [...families].flatMap(([label, items]) => {
    const pages: { label: string; items: readonly JevCandidate[] }[] = [];
    for (let start = 0; start < items.length; start += 200)
      pages.push({
        label: `${label} (options ${String(start + 1)}–${String(Math.min(items.length, start + 200))})`,
        items: items.slice(start, start + 200),
      });
    return pages;
  });
  // Very large catalogues use a balanced hierarchy, keeping all actions reachable.
  const width = Math.max(1, Math.ceil(entries.length / 200));
  const groups: Record<string, readonly JevCandidate[]> = {};
  const criteria: Record<string, unknown> = {};
  for (let start = 0; start < entries.length; start += width) {
    const chunk = entries.slice(start, start + width);
    const id = `group-${String(start)}`;
    groups[id] = chunk.flatMap((entry) => entry.items);
    criteria[id] = {
      groups: chunk.map((entry) => entry.label),
      examples: groups[id]
        .slice(0, 3)
        .map((candidate) => describeCandidate(candidate)),
    };
  }
  return {
    groups,
    request: {
      model: "jev-latest",
      state: snapshot.state,
      questions: {
        action: {
          type: "choice",
          instructions: `${instructions} This is a grouped catalogue: choose the action family/region to inspect; the exact action is selected in the next request.`,
          criteria,
        },
      },
    },
  };
}

/** Preserve structured option facts as JSON rather than a doubly escaped JSON string. */
function describeCandidate(candidate: JevCandidate): unknown {
  if (!candidate.description.startsWith("{")) return candidate.description;
  try {
    return JSON.parse(candidate.description) as unknown;
  } catch {
    return candidate.description;
  }
}
