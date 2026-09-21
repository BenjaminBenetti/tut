import type { CampaignStore } from "../../ui/model/game-session";
import { namesFor } from "../../ui/service/tactical-error-text";
import type {
  JevInspector,
  JevTrace,
  JevExchange,
} from "../../ui/model/jev-inspector";
import type { JevSnapshot } from "../../tactical/model/jev-control";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { TEAM_FOR_PHASE } from "../../tactical/model/tactical-state";
import { captureJev, jevChoicePage } from "../../tactical/ai/jev-request";
import type { JevActionRules } from "../../tactical/ai/jev-actions";
import {
  configureJev,
  defaultBugAct,
  jevAct,
} from "../../tactical/model/jev-command";
import { endTurn } from "../../tactical/model/end-turn-command";
import {
  jevFinished,
  jevEndTurnPending,
  manualTdfHasActions,
} from "../../tactical/service/jev-control-service";
import { missionOutcome } from "../../tactical/service/mission-end-service";
import { JevRequestError } from "../service/jev-client";
import type { JevTransport } from "../service/jev-client";

/** Orchestrate external decisions around pure commands; both inspector and gameplay record identical exchanges. */
export class JevController implements JevInspector {
  // ===========================================
  // Session state
  // ===========================================
  private traces: JevTrace[] = [];
  private readonly listeners = new Set<() => void>();
  private sequence = 0;
  private detach?: () => void;
  private stopped = false;
  private paused = false;
  private running = false;
  private reschedule = false;
  private readonly pending = new Set<AbortController>();
  private automatic?: AbortController;
  readonly configured: boolean;

  // ===========================================
  // Inspector and lifecycle
  // ===========================================

  /** Bind to one campaign store; disposal invalidates every outstanding decision. */
  constructor(
    private readonly store: CampaignStore,
    private readonly transport: JevTransport,
    private readonly rules: JevActionRules,
  ) {
    this.configured = transport.configured;
  }
  /** Most recent traces, including exact snapshots. */
  get history(): readonly JevTrace[] {
    return this.traces;
  }
  /** Current mission from the live store. */
  mission(): TacticalState | undefined {
    return this.store.getState().activeMission;
  }
  /** Freeze an observation with the HUD's roster names and automatic play's catalogue. */
  capture(
    unitId: string,
    prompts?: { entity: string; commander: string },
  ): JevSnapshot {
    const campaign = this.store.getState();
    const mission = campaign.activeMission;
    if (!mission) throw new Error("No active mission");
    const names = namesFor(mission, campaign);
    const unitNames = Object.fromEntries(
      mission.units.map((unit) => [unit.id, names.unit(unit.id)]),
    );
    return captureJev(mission, unitId, this.rules, prompts, unitNames);
  }
  /** Evaluate only the first question of a frozen snapshot without applying its action. */
  async evaluate(snapshot: JevSnapshot): Promise<void> {
    await this.decide(snapshot, "preview");
  }
  /** Advance a captured preview by one request; a running or completed trace cannot advance twice. */
  async step(traceId: number): Promise<void> {
    const trace = this.traces.find((entry) => entry.id === traceId);
    if (trace?.mode === "preview") await this.advance(trace);
  }
  /** Save explicit edits, then let the store subscription schedule any newly enabled actor. */
  configure(
    unitId: string,
    enabled: boolean,
    entity: string,
    commander: string,
  ): void {
    if (enabled && !this.configured)
      throw new Error("Configure the relay URL before enabling Jev control.");
    const result = this.store.dispatch(
      configureJev(unitId, { enabled, entityPrompt: entity }, commander),
    );
    if (!result.ok) throw new Error(result.error.message);
  }
  /** Subscribe to trace changes independently of game-state changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Inspector use pauses autoplay and cancels its pending response. */
  pause(paused: boolean): void {
    this.paused = paused;
    if (paused) this.automatic?.abort();
    else this.schedule();
  }
  /** Attach after the tactical screen has subscribed to animation events. */
  start(): void {
    this.stopped = false;
    this.detach = this.store.subscribe(() => this.schedule());
    this.schedule();
  }
  /** Leave no request capable of acting on a replaced screen or campaign. */
  dispose(): void {
    this.stopped = true;
    this.detach?.();
    for (const pending of this.pending) pending.abort();
    this.listeners.clear();
  }

  // ===========================================
  // Automatic play
  // ===========================================

  /** Avoid nested store notifications and run one actor at a time. */
  private schedule(): void {
    if (this.stopped || this.paused) return;
    if (this.running) {
      this.reschedule = true;
      return;
    }
    this.running = true;
    void Promise.resolve()
      .then(() => this.run())
      .catch((error: unknown) => {
        const trace = this.traces.at(-1);
        if (trace)
          this.update(trace.id, {
            status: "failed",
            detail: error instanceof Error ? error.message : String(error),
          });
      })
      .finally(() => {
        this.running = false;
        if (this.reschedule) {
          this.reschedule = false;
          this.schedule();
        }
      });
  }

  /** Resume from saved phase progress. Ordinary bugs still use their existing species behaviours. */
  private async run(): Promise<void> {
    const counts = new Map<string, number>();
    while (!this.stopped && !this.paused) {
      const mission = this.mission();
      if (!mission || mission.outcome) return;
      if (
        mission.phase === "player" &&
        !jevEndTurnPending(mission) &&
        manualTdfHasActions(mission)
      )
        return;
      const externalBugs =
        mission.phase === "bugs" && mission.jev?.activation?.externalBugs;
      if (externalBugs && missionOutcome(mission) !== undefined) {
        this.store.dispatch(endTurn());
        return;
      }
      const actor = mission.units.find(
        (unit) =>
          unit.hp > 0 &&
          unit.team === TEAM_FOR_PHASE[mission.phase] &&
          !jevFinished(mission, unit.id) &&
          (externalBugs === true ||
            (unit.ap > 0 && mission.jev?.entities[unit.id]?.enabled)),
      );
      if (!actor) {
        if (externalBugs || jevEndTurnPending(mission)) {
          const ended = this.store.dispatch(endTurn());
          if (!ended.ok) return;
          continue;
        }
        return;
      }
      if (!mission.jev?.entities[actor.id]?.enabled) {
        const applied = this.store.dispatch(
          defaultBugAct(actor.id, mission.commandSeq),
        );
        if (!applied.ok) return;
        continue;
      }
      const key = `${String(mission.turn)}:${mission.phase}:${actor.id}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      if (count > 16 || actor.ap <= 0) {
        this.store.dispatch(
          jevAct({
            unitId: actor.id,
            expectedSeq: mission.commandSeq,
            choice: "finish",
          }),
        );
        continue;
      }
      const snapshot = this.capture(actor.id);
      const trace = await this.decide(snapshot, "automatic");
      if (this.stopped || this.paused) return;
      const current = this.mission();
      if (current !== mission) {
        this.update(trace.id, {
          status: "stale",
          detail:
            "The mission changed during evaluation; this result was not applied.",
        });
        continue;
      }
      if (trace.status === "skipped") {
        this.store.dispatch(
          jevAct({
            unitId: actor.id,
            expectedSeq: current.commandSeq,
            choice: "finish",
          }),
        );
        continue;
      }
      if (!trace.candidate) {
        const fallback =
          actor.team === "bugs"
            ? defaultBugAct(actor.id, current.commandSeq)
            : jevAct({
                unitId: actor.id,
                expectedSeq: current.commandSeq,
                choice: "finish",
              });
        const result = this.store.dispatch(fallback);
        this.update(trace.id, {
          status: "fallback",
          detail: result.ok
            ? actor.team === "bugs"
              ? "Existing bug behaviour used after Jev failed."
              : "TDF entity held position after Jev failed; manual control remains available."
            : result.error.message,
        });
        if (!result.ok) return;
        continue;
      }
      const applied = this.store.dispatch(
        jevAct({
          unitId: actor.id,
          expectedSeq: current.commandSeq,
          choice: trace.candidate.id,
          command: trace.candidate.command,
        }),
      );
      this.update(trace.id, {
        status: applied.ok ? "applied" : "failed",
        detail: applied.ok
          ? trace.candidate.description
          : applied.error.message,
      });
      if (!applied.ok) {
        // A hidden blocker may make a perceived path invalid. Never probe it repeatedly.
        this.store.dispatch(
          jevAct({
            unitId: actor.id,
            expectedSeq: current.commandSeq,
            choice: "finish",
          }),
        );
      }
    }
  }

  // ===========================================
  // Shared evaluation and history
  // ===========================================

  /** Previews pause after one question; automatic turns consume the same steps until an action is selected. */
  private async decide(
    snapshot: JevSnapshot,
    mode: JevTrace["mode"],
  ): Promise<JevTrace> {
    const id = ++this.sequence;
    const canAct = snapshot.eligible && snapshot.candidates.length > 0;
    let trace: JevTrace = {
      id,
      mode,
      snapshot,
      exchanges: [],
      status: canAct ? "ready" : "skipped",
      next: canAct ? jevChoicePage(snapshot) : undefined,
      detail: canAct
        ? undefined
        : "No request sent: this entity cannot act or has no available actions.",
    };
    this.traces = [...this.traces, trace].slice(-30);
    this.emit();
    do {
      trace = await this.advance(trace);
    } while (
      mode === "automatic" &&
      trace.status === "ready" &&
      !this.stopped &&
      !this.paused
    );
    return trace;
  }

  /** Send one prepared question and retain either its selected action or its unsent follow-up. */
  private async advance(trace: JevTrace): Promise<JevTrace> {
    if (trace.status !== "ready" || !trace.next || this.stopped) return trace;
    const { id, snapshot, mode, next: page } = trace;
    if (trace.exchanges.length >= 8)
      return this.update(id, {
        status: "failed",
        next: undefined,
        detail: "Action grouping exceeded its request limit",
      });
    trace = this.update(id, { status: "running" });
    const controller = new AbortController();
    this.pending.add(controller);
    if (mode === "automatic") this.automatic = controller;
    try {
      const metadata = {
        stage: page.stage,
        requestBytes: new TextEncoder().encode(JSON.stringify(page.request))
          .length,
      };
      const started = performance.now();
      let exchange: JevExchange;
      try {
        const reply = await this.transport.ask(page.request, controller.signal);
        exchange = {
          ...metadata,
          request: page.request,
          response: reply.raw,
          requestId: reply.requestId,
          answer: reply.answer,
          elapsedMs: Math.round(performance.now() - started),
        };
      } catch (error) {
        exchange = {
          ...metadata,
          request: page.request,
          elapsedMs: Math.round(performance.now() - started),
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof JevRequestError
            ? { response: error.response, requestId: error.requestId }
            : {}),
        };
      }
      trace = this.update(id, {
        exchanges: [...trace.exchanges, exchange],
        next: undefined,
      });
      if (controller.signal.aborted || this.stopped)
        return this.update(id, { status: "cancelled" });
      if (
        mode === "automatic" &&
        this.mission()?.commandSeq !== snapshot.commandSeq
      )
        return this.update(id, { status: "stale" });
      if (!exchange.answer)
        return this.update(id, { status: "failed", detail: exchange.error });
      if (page.groups) {
        const next = page.groups[exchange.answer.choice];
        const count = Object.values(page.groups).reduce(
          (total, items) => total + items.length,
          0,
        );
        if (
          !next?.length ||
          (page.stage !== "action-type" && next.length >= count)
        )
          throw new Error("Invalid Jev action group");
        return this.update(id, {
          status: "ready",
          next: jevChoicePage(snapshot, next),
        });
      }
      const candidate = snapshot.candidates.find(
        (entry) =>
          entry.id === exchange.answer?.choice &&
          Object.hasOwn(page.request.questions.action!.criteria, entry.id),
      );
      if (!candidate) throw new Error("Unknown Jev action");
      return this.update(id, { status: "evaluated", candidate });
    } catch (error) {
      return this.update(id, {
        status: "failed",
        next: undefined,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.pending.delete(controller);
      if (this.automatic === controller) this.automatic = undefined;
    }
  }

  /** Replace rather than mutate history records so consumers can safely retain a trace. */
  private update(id: number, patch: Partial<JevTrace>): JevTrace {
    const index = this.traces.findIndex((trace) => trace.id === id);
    const trace = { ...this.traces[index]!, ...patch };
    this.traces[index] = trace;
    this.emit();
    return trace;
  }
  /** Notify inspector listeners. */
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
