import type {
  JevCandidate,
  JevRequest,
  JevSnapshot,
} from "../model/jev-control";
import type { TacticalState } from "../model/tactical-state";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { PHASE_FOR_TEAM } from "../model/tactical-state";
import { jevPerception, jevState } from "./jev-observation";
import { jevCandidates } from "./jev-actions";
import type { JevActionRules } from "./jev-actions";

/** Capture current state with injected roster names; only perceived units reach the snapshot. */
export function captureJev(
  mission: TacticalState,
  unitId: string,
  rules: JevActionRules,
  prompts?: { readonly entity: string; readonly commander: string },
  unitNames: Readonly<Record<string, string>> = {},
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
    unitNames,
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
    candidates: eligible ? jevCandidates(view, actor, rules) : [],
  };
  // Freeze by value, never retain references to a changing mission or prompt draft.
  return JSON.parse(JSON.stringify(snapshot)) as JevSnapshot;
}

/** One visible step: action type first, then groups or concrete actions of that type. */
export interface JevChoicePage {
  readonly stage: "action-type" | "action-group" | "action";
  readonly request: JevRequest;
  readonly groups?: Readonly<Record<string, readonly JevCandidate[]>>;
}

// Count alone does not bound tokens: ground attacks carry much larger previews than moves.
const MAX_LEAF_CHOICES = 48;
const MAX_CRITERIA_CHARACTERS = 12000;
const MAX_GROUP_CHOICES = 32;
const INSTRUCTIONS =
  "Choose for `actor` using only observed and remembered facts in `state`. Follow `commander_prompt` for faction priorities and `entity_prompt` for this entity's role; commander priorities win explicit conflicts. Consider objectives, AP, weapons, cover, hazards, survival and friendly fire. Resolve names in orders against actor.name and entities[].name. Unknown enemies and terrain must not be assumed known. Historical sightings are not current targets.";
const ACTION_TYPES: Readonly<Record<string, string>> = {
  move: "Spend one AP moving to a reachable position to advance, follow, retreat or seek cover.",
  attack: "Attack a visible enemy unit or nest with a ready weapon.",
  "attack-ground":
    "Fire at a tile, considering blast effects, cover destruction and friendly fire.",
  overwatch:
    "Reserve fire to react to enemy movement until the next faction turn.",
  reload: "Reload ammunition or vent a weapon's heat pool.",
  equipment:
    "Use available equipment, such as grenades, healing, smoke or deployables.",
  brace: "Brace the mech for improved stability.",
  coolant: "Spend coolant to reduce mech heat.",
  designate: "Mark an enemy to help allied attacks.",
  jump: "Use jump jets to reach another position.",
  extract: "Extract this unit from the mission.",
  interact: "Interact with a mission objective.",
  "harvest-carcass": "Harvest a visible bug carcass for tech points.",
};

/** Route by the actor's specific weapon/mode or item; follow-ups contain only that action's targets. */
export function jevChoicePage(
  snapshot: JevSnapshot,
  candidates?: readonly JevCandidate[],
): JevChoicePage {
  if (candidates === undefined) {
    const groups: Record<string, JevCandidate[]> = {};
    for (const candidate of snapshot.candidates) {
      const id = candidate.actionType?.id ?? candidate.category;
      (groups[id] ??= []).push(candidate);
    }
    return choicePage(
      snapshot,
      "action-type",
      Object.fromEntries(
        Object.entries(groups).map(([id, items]) => [
          id,
          {
            action: id,
            ...(items[0]?.actionType ?? {
              purpose: ACTION_TYPES[id] ?? id,
            }),
            available_options: items.length,
          },
        ]),
      ),
      groups,
    );
  }
  const criteria = Object.fromEntries(
    candidates.map((candidate) => [candidate.id, describeCandidate(candidate)]),
  );
  if (
    candidates.length <= MAX_LEAF_CHOICES &&
    (JSON.stringify(criteria).length <= MAX_CRITERIA_CHARACTERS ||
      candidates.length === 1)
  )
    return choicePage(snapshot, "action", criteria);

  // Spatial families retain every destination. A large family is split by size as well as count.
  const families = new Map<string, JevCandidate[]>();
  for (const candidate of candidates) {
    const pos = destination(candidate);
    const key = pos
      ? `${String(Math.floor(pos.x / 8))}:${String(pos.y)}:${String(Math.floor(pos.z / 8))}`
      : candidate.category;
    const family = families.get(key) ?? [];
    family.push(candidate);
    families.set(key, family);
  }
  const pages: JevCandidate[][] = [];
  for (const family of families.values()) {
    let page: JevCandidate[] = [];
    let size = 0;
    for (const candidate of family) {
      const cost = candidate.id.length + candidate.description.length + 8;
      if (
        page.length &&
        (page.length >= MAX_LEAF_CHOICES ||
          size + cost > MAX_CRITERIA_CHARACTERS)
      ) {
        pages.push(page);
        page = [];
        size = 0;
      }
      page.push(candidate);
      size += cost;
    }
    if (page.length) pages.push(page);
  }
  const width = Math.max(1, Math.ceil(pages.length / MAX_GROUP_CHOICES));
  const groups: Record<string, readonly JevCandidate[]> = {};
  for (let start = 0; start < pages.length; start += width)
    groups[`group-${String(start)}`] = pages.slice(start, start + width).flat();
  return choicePage(
    snapshot,
    "action-group",
    Object.fromEntries(
      Object.entries(groups).map(([id, items]) => [id, describeGroup(items)]),
    ),
    groups,
  );
}

/** Build the exact wire request; stage metadata stays in the inspector trace. */
function choicePage(
  snapshot: JevSnapshot,
  stage: JevChoicePage["stage"],
  criteria: Readonly<Record<string, unknown>>,
  groups?: JevChoicePage["groups"],
): JevChoicePage {
  const task =
    stage === "action-type"
      ? "Choose the best specific action to take next. Each available weapon and firing mode, usable item, and other ability is listed separately for this actor. Choose the weapon or item now; its target or destination will be selected in a follow-up containing ONLY that action."
      : stage === "action-group"
        ? "The action type has been chosen. Choose a region or target group within that type; a subsequent request will choose the concrete action."
        : "The specific action, including its weapon or item, has been chosen. Choose the best target or destination from ONLY the offered options for that action.";
  return {
    stage,
    groups,
    request: {
      model: "jev-latest",
      state: snapshot.state,
      questions: {
        action: {
          type: "choice",
          instructions: `${INSTRUCTIONS} ${task}`,
          criteria,
        },
      },
    },
  };
}

/** The concrete endpoint is enough to describe a region; paths remain local. */
function destination(candidate: JevCandidate): TileCoord | undefined {
  const payload = candidate.command?.payload;
  return (
    payload &&
    ("tile" in payload
      ? payload.tile
      : "path" in payload
        ? payload.path.at(-1)
        : undefined)
  );
}

/** Summarize a group without embedding full action previews in the routing question. */
function describeGroup(
  candidates: readonly JevCandidate[],
): Readonly<Record<string, unknown>> {
  const positions = candidates.flatMap((candidate) => {
    const pos = destination(candidate);
    return pos ? [pos] : [];
  });
  const targets = candidates.flatMap((candidate) => {
    const payload = candidate.command?.payload;
    return payload && "targetId" in payload ? [payload.targetId] : [];
  });
  return {
    action: candidates[0]?.actionType?.id ?? candidates[0]?.category,
    count: candidates.length,
    ...(positions.length
      ? {
          region: {
            x: [
              Math.min(...positions.map((pos) => pos.x)),
              Math.max(...positions.map((pos) => pos.x)),
            ],
            y: [
              Math.min(...positions.map((pos) => pos.y)),
              Math.max(...positions.map((pos) => pos.y)),
            ],
            z: [
              Math.min(...positions.map((pos) => pos.z)),
              Math.max(...positions.map((pos) => pos.z)),
            ],
          },
        }
      : {}),
    ...(targets.length
      ? { example_target_ids: [...new Set(targets)].slice(0, 8) }
      : {}),
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
