import type {
  JevAnswer,
  JevCandidate,
  JevRequest,
  JevSnapshot,
} from "../../tactical/model/jev-control";
import type { TacticalState } from "../../tactical/model/tactical-state";

/** One actual HTTP exchange, including unsuccessful responses. */
export interface JevExchange {
  readonly request: JevRequest;
  readonly response?: unknown;
  readonly requestId?: string;
  readonly elapsedMs: number;
  readonly answer?: JevAnswer;
  readonly error?: string;
}

/** Bounded session history; each trace retains the exact immutable input it evaluated. */
export interface JevTrace {
  readonly id: number;
  readonly mode: "preview" | "automatic";
  readonly snapshot: JevSnapshot;
  readonly exchanges: readonly JevExchange[];
  readonly candidate?: JevCandidate;
  readonly status:
    | "running"
    | "evaluated"
    | "applied"
    | "stale"
    | "failed"
    | "fallback"
    | "cancelled";
  readonly detail?: string;
}

/** Interface shared by the development inspector and the app's asynchronous controller. */
export interface JevInspector {
  readonly configured: boolean;
  readonly history: readonly JevTrace[];
  /** Read current mission without keeping stale view references. */
  mission(): TacticalState | undefined;
  /** Capture inputs; prompts supplied here are evaluation-only drafts. */
  capture(
    unitId: string,
    prompts?: { entity: string; commander: string },
  ): JevSnapshot;
  /** Preview through the same transport and questions as automatic turns. */
  evaluate(snapshot: JevSnapshot): Promise<void>;
  /** Persist prompt and control changes explicitly. */
  configure(
    unitId: string,
    enabled: boolean,
    entity: string,
    commander: string,
  ): void;
  /** Receive trace updates; returns a disposer. */
  subscribe(listener: () => void): () => void;
  /** Pause automatic play while inspecting. */
  pause(paused: boolean): void;
  /** Start observing the active mission. */
  start(): void;
  /** Abort requests and stop observing when the screen/session leaves. */
  dispose(): void;
}
