import type {} from "./tactical-command";
import type {} from "../../overworld/model/overworld-command";
import type { Tile } from "../../mapgen/model/tile";
import type { Connector } from "../../mapgen/model/connector";
import type { TacticalPhase } from "./tactical-state";
import type { Team } from "./unit";
import type { TacticalCommand, TacticalCommandFor } from "./tactical-command";
import type { TileCoord } from "../../mapgen/model/tile-coord";

/** Shared limit for editable entity and faction orders. */
export const JEV_PROMPT_MAX_LENGTH = 8000;

/**
 * Derive entity orders from the game's command registry. New commands require a
 * Jev provider and instructions at compile time, unless deliberately excluded
 * here as mission lifecycle, controller orchestration, configuration or debug.
 */
export type JevActionCommand = Exclude<
  TacticalCommand,
  {
    readonly type:
      | "tactical:end-turn"
      | "tactical:abandon-mission"
      | "tactical:jev-act"
      | "tactical:default-bug-act"
      | "tactical:configure-jev"
      | "tactical:set-jev-commander-prompt"
      | "tactical:place-unit";
  }
>;

/** Runtime allowlist and owner fields, exhaustive over entity commands so new capabilities can execute. */
export const JEV_ACTION_OWNER_FIELDS = {
  "tactical:attack": "attackerId",
  "tactical:move": "unitId",
  "tactical:overwatch": "unitId",
  "tactical:reload": "unitId",
  "tactical:use-equipment": "unitId",
  "tactical:mech-action": "unitId",
  "tactical:extract": "unitId",
  "tactical:interact": "unitId",
  "tactical:harvest-carcass": "unitId",
} as const satisfies {
  readonly [
    Type in JevActionCommand["type"]
  ]: keyof TacticalCommandFor<Type>["payload"];
};

/** Explicit opt-in and the individual entity's instructions. */
export interface JevEntityControl {
  readonly enabled: boolean;
  readonly entityPrompt: string;
}

/** Terrain remembered only when actually visible to a faction. */
export interface JevKnowledge {
  readonly tiles: readonly Tile[];
  readonly connectors: readonly Connector[];
}

/** Saved progress and commands; requests in flight and credentials are never saved. */
export interface JevControl {
  readonly entities: Readonly<Record<string, JevEntityControl>>;
  readonly commanders: Readonly<Record<Team, string>>;
  readonly knowledge?: Partial<Readonly<Record<Team, JevKnowledge>>>;
  readonly activation?: {
    readonly turn: number;
    readonly phase: TacticalPhase;
    readonly finished: readonly string[];
    readonly externalBugs: boolean;
    /** The player ended this turn; finish Jev TDF activations before opening the bug phase. */
    readonly endTurnRequested?: boolean;
    /** Explicit extraction moves that arrived on the last AP; complete after movement playback. */
    readonly pendingExtractions?: readonly string[];
  };
  readonly decisions?: readonly {
    readonly unitId: string;
    readonly turn: number;
    readonly phase: TacticalPhase;
    readonly choice: string;
    readonly command?: JevActionCommand;
    readonly extractOnArrival?: boolean;
  }[];
}

/** One loadout-specific action offered before choosing its target or destination. */
export interface JevActionType {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly capability: Readonly<Record<string, unknown>>;
}

/** One executable option and its factual explanation for Jev and the inspector. */
export interface JevCandidate {
  readonly id: string;
  readonly category: string;
  /** Separates each weapon and usable item within a broad command category. */
  readonly actionType?: JevActionType;
  /** Base AP cost, separate from any remaining AP forfeited when the activation ends. */
  readonly apCost?: number;
  /** Whether executing this action ends the actor's activation, forfeiting any unspent AP. */
  readonly endsActivation?: boolean;
  readonly description: string;
  readonly command?: JevActionCommand;
  /** Local route and legal stopping points; never an exhaustive tile menu on the wire. */
  readonly movement?: JevMovement;
}

/** A selected intent and its one-AP route, costed using the full map layout. */
export interface JevMovement {
  readonly intent: string;
  /** Permit the free extraction follow-up only if this move reaches the zone with zero AP. */
  readonly extractOnArrival?: boolean;
  readonly targetId?: string;
  readonly targetName?: string;
  readonly targetPosition?: TileCoord;
  readonly routeKind: "known-route";
  readonly stops: readonly {
    readonly steps: number;
    readonly cost: number;
  }[];
}

/** Named alternatives for action and target selection. */
export interface JevChoiceQuestion {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, unknown>>;
}

/** Ordered descriptive levels for movement extent. */
export interface JevScoreQuestion {
  readonly type: "score";
  readonly instructions: string;
  readonly criteria: readonly string[];
}

/** Wire shape from TypeSafe's v1 HTTP API. */
export interface JevRequest {
  readonly model: string;
  readonly state: Readonly<Record<string, unknown>>;
  readonly questions: {
    readonly action?: JevChoiceQuestion;
    readonly distance?: JevScoreQuestion;
  };
}

/** A frozen evaluation input, built once and shared by inspection and automatic control. */
export interface JevSnapshot {
  readonly missionId: string;
  readonly commandSeq: number;
  readonly unitId: string;
  readonly team: Team;
  readonly turn: number;
  readonly phase: TacticalPhase;
  readonly eligible: boolean;
  readonly state: Readonly<Record<string, unknown>>;
  readonly candidates: readonly JevCandidate[];
}

/** A validated typed answer, retaining the raw wire response separately in the trace. */
export type JevAnswer = (
  | { readonly choice: string; readonly score?: never }
  | {
      readonly score: number;
      readonly choice?: never;
    }
) & {
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
};
