import type {
  JevAnswer,
  JevCandidate,
  JevRequest,
  JevSnapshot,
} from "../../tactical/model/jev-control";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { JevChoicePage } from "../../tactical/ai/jev-request";

/** One actual HTTP exchange, including unsuccessful responses. */
export interface JevExchange {
  readonly stage: JevChoicePage["stage"];
  /** UTF-8 wire bytes, not a tokenizer estimate. */
  readonly requestBytes: number;
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
  /** Prepared next question; previews wait for an explicit step before sending it. */
  readonly next?: JevChoicePage;
  readonly candidate?: JevCandidate;
  readonly status:
    | "running"
    | "ready"
    | "skipped"
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
  /** Preview the first question only, without executing an action. */
  evaluate(snapshot: JevSnapshot): Promise<void>;
  /** Send exactly one pending follow-up for this captured preview. */
  step(traceId: number): Promise<void>;
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
