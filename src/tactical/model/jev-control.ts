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
  };
  readonly decisions?: readonly {
    readonly unitId: string;
    readonly turn: number;
    readonly phase: TacticalPhase;
    readonly choice: string;
    readonly command?: JevActionCommand;
  }[];
}

/** One executable option and its factual explanation for Jev and the inspector. */
export interface JevCandidate {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly command?: JevActionCommand;
}

/** Wire shape from TypeSafe's v1 HTTP API. */
export interface JevRequest {
  readonly model: string;
  readonly state: Readonly<Record<string, unknown>>;
  readonly questions: Readonly<
    Record<
      string,
      {
        readonly type: "choice";
        readonly instructions: string;
        readonly criteria: Readonly<Record<string, unknown>>;
      }
    >
  >;
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
export interface JevAnswer {
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
}
