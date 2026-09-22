import type {} from "./tactical-command";
import type {} from "../../overworld/model/overworld-command";
import type { Tile } from "../../mapgen/model/tile";
import type { Connector } from "../../mapgen/model/connector";
import type { TacticalPhase } from "./tactical-state";
import type { Team } from "./unit";
import type { AttackCommand } from "./attack-command";
import type { MoveCommand } from "./move-command";
import type { OverwatchCommand } from "./overwatch-command";
import type { ReloadCommand } from "./reload-command";
import type { UseEquipmentCommand } from "./use-equipment-command";
import type { MechActionCommand } from "./mech-action-command";
import type { InteractCommand } from "./interact-command";
import type { ExtractCommand } from "./extract-command";
import type { HarvestCarcassCommand } from "./harvest-carcass-command";
import type { TileCoord } from "../../mapgen/model/tile-coord";

/** Shared limit for editable entity and faction orders. */
export const JEV_PROMPT_MAX_LENGTH = 8000;

/** Only orders belonging to one entity; never phase, configuration or campaign commands. */
export type JevActionCommand =
  | AttackCommand
  | MoveCommand
  | OverwatchCommand
  | ReloadCommand
  | UseEquipmentCommand
  | MechActionCommand
  | InteractCommand
  | ExtractCommand
  | HarvestCarcassCommand;

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
  };
  readonly decisions?: readonly {
    readonly unitId: string;
    readonly turn: number;
    readonly phase: TacticalPhase;
    readonly choice: string;
    readonly command?: JevActionCommand;
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
