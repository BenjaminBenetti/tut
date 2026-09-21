import type { JevInspector, JevTrace } from "../model/jev-inspector";
import type { JevSnapshot } from "../../tactical/model/jev-control";
import { jevChoicePage } from "../../tactical/ai/jev-request";

/** Development-only entity inspector. All text is rendered as text, including user prompts and model output. */
export class JevInspectorView {
  // ===========================================
  // Elements and captured state
  // ===========================================
  private panel?: HTMLElement;
  private toggle?: HTMLButtonElement;
  private title?: HTMLElement;
  private status?: HTMLElement;
  private entity?: HTMLTextAreaElement;
  private commander?: HTMLTextAreaElement;
  private enabled?: HTMLInputElement;
  private stateText?: HTMLTextAreaElement;
  private questionsText?: HTMLTextAreaElement;
  private outputText?: HTMLTextAreaElement;
  private historySelect?: HTMLSelectElement;
  private runButton?: HTMLButtonElement;
  private rerunButton?: HTMLButtonElement;
  private selected?: string;
  private snapshot?: JevSnapshot;
  private traceId?: number;
  private open = false;
  private pending = false;
  private unsubscribe?: () => void;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** The port is also used by autonomous turns; this view has no separate Jev prompt implementation. */
  constructor(private readonly inspector: JevInspector) {}

  /** Place the entity menu button in the HUD and a resizable inspection panel above the battlefield. */
  mount(parent: HTMLElement, toolbar: HTMLElement): void {
    const doc = parent.ownerDocument;
    this.toggle = button(doc, "Jev", () => this.show(!this.open));
    this.toggle.dataset.testid = "jev-toggle";
    this.toggle.disabled = true;
    toolbar.append(this.toggle);
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-jev";
    panel.dataset.testid = "jev-inspector";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Jev entity inspector");
    panel.hidden = true;
    // Keep native scrolling; the viewport's wheel handler would cancel it and zoom the map.
    panel.addEventListener("wheel", (event) => event.stopPropagation(), {
      passive: true,
    });
    panel.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") this.show(false);
    });
    const header = doc.createElement("header");
    this.title = doc.createElement("strong");
    header.append(
      this.title,
      button(doc, "Close", () => this.show(false)),
    );
    this.status = doc.createElement("p");
    this.status.setAttribute("role", "status");
    this.status.dataset.testid = "jev-status";
    const prompts = doc.createElement("div");
    prompts.className = "tut-jev__prompts";
    this.entity = textarea(doc, "Entity prompt", prompts);
    this.entity.dataset.testid = "jev-entity-prompt";
    this.commander = textarea(
      doc,
      "Commander prompt · entire faction",
      prompts,
    );
    this.commander.dataset.testid = "jev-commander-prompt";
    this.entity.maxLength = this.commander.maxLength = 8000;
    const controls = doc.createElement("div");
    controls.className = "tut-jev__controls";
    const label = doc.createElement("label");
    this.enabled = doc.createElement("input");
    this.enabled.type = "checkbox";
    this.enabled.dataset.testid = "jev-enabled";
    label.append(this.enabled, " Jev controls this entity");
    const save = button(doc, "Save control & prompts", () => this.save());
    save.dataset.testid = "jev-save";
    this.runButton = button(doc, "Evaluate current state", () => {
      void this.evaluate(false);
    });
    this.runButton.dataset.testid = "jev-evaluate";
    this.rerunButton = button(doc, "Re-run captured state", () => {
      void this.evaluate(true);
    });
    controls.append(
      label,
      save,
      button(doc, "Refresh state", () => this.capture()),
      this.runButton,
      this.rerunButton,
    );
    const history = doc.createElement("div");
    history.className = "tut-jev__controls";
    this.historySelect = doc.createElement("select");
    this.historySelect.setAttribute("aria-label", "Jev request history");
    this.historySelect.dataset.testid = "jev-history";
    this.historySelect.addEventListener("change", () => {
      this.traceId = Number(this.historySelect!.value);
      const trace = this.currentTrace();
      if (trace) {
        this.snapshot = trace.snapshot;
        this.render();
      }
    });
    history.append(
      this.historySelect,
      button(doc, "Copy request & output", () => {
        void this.copy();
      }),
      button(doc, "Export JSON", () => this.download()),
    );
    const panes = doc.createElement("div");
    panes.className = "tut-jev__panes";
    this.stateText = textarea(doc, "State · exact request JSON", panes, true);
    this.stateText.dataset.testid = "jev-state";
    this.questionsText = textarea(
      doc,
      "Questions · exact request JSON",
      panes,
      true,
    );
    this.questionsText.dataset.testid = "jev-questions";
    this.outputText = textarea(
      doc,
      "Output · answers, probabilities, timing and all exchanges",
      panes,
      true,
    );
    this.outputText.dataset.testid = "jev-output";
    panel.append(header, this.status, prompts, controls, history, panes);
    parent.append(panel);
    this.panel = panel;
    this.unsubscribe = this.inspector.subscribe(() => this.render());
  }

  /** Follow the entity whose card is inspected, including a targeted bug. */
  update(unitId: string | undefined): void {
    if (this.toggle) this.toggle.disabled = !unitId;
    if (unitId !== this.selected) {
      this.selected = unitId;
      this.traceId = undefined;
      this.snapshot = undefined;
      if (this.open) this.loadEntity();
    }
    if (this.open) this.renderStatus();
  }

  /** Clean up and release any inspection pause. */
  unmount(): void {
    this.unsubscribe?.();
    this.panel?.remove();
    this.toggle?.remove();
    this.inspector.pause(false);
  }

  // ===========================================
  // Inspection and prompt editing
  // ===========================================

  /** Opening pauses automatic actions; evaluating never dispatches a tactical action. */
  private show(open: boolean): void {
    if (open && !this.selected) return;
    this.open = open;
    if (this.panel) this.panel.hidden = !open;
    this.toggle?.setAttribute("aria-expanded", String(open));
    this.inspector.pause(open);
    if (open) this.loadEntity();
  }

  /** Reset draft prompts only when a different entity is inspected or the panel opens. */
  private loadEntity(): void {
    const mission = this.inspector.mission();
    const actor = mission?.units.find((unit) => unit.id === this.selected);
    if (!actor || !this.entity || !this.commander || !this.enabled) return;
    this.entity.value = mission?.jev?.entities[actor.id]?.entityPrompt ?? "";
    this.commander.value = mission?.jev?.commanders[actor.team] ?? "";
    this.enabled.checked = mission?.jev?.entities[actor.id]?.enabled ?? false;
    this.capture();
  }

  /** Capture current truth and current prompt drafts, with no network traffic. */
  private capture(): void {
    if (!this.selected) return;
    try {
      this.snapshot = this.inspector.capture(this.selected, {
        entity: this.entity?.value ?? "",
        commander: this.commander?.value ?? "",
      });
      this.traceId = undefined;
      this.render();
    } catch (error) {
      this.message(error);
    }
  }

  /** Explicitly persist edits; preview drafts alone never change faction orders. */
  private save(): void {
    if (!this.selected) return;
    try {
      this.inspector.configure(
        this.selected,
        this.enabled?.checked ?? false,
        this.entity?.value ?? "",
        this.commander?.value ?? "",
      );
      this.capture();
    } catch (error) {
      this.message(error);
    }
  }

  /** Re-runs retain the frozen battlefield while substituting the current prompt drafts. */
  private async evaluate(reuse: boolean): Promise<void> {
    if (this.pending) return;
    if (!reuse) this.capture();
    if (!this.snapshot) return;
    const snapshot: JevSnapshot = {
      ...this.snapshot,
      state: {
        ...this.snapshot.state,
        entity_prompt: this.entity?.value ?? "",
        commander_prompt: this.commander?.value ?? "",
      },
    };
    this.pending = true;
    this.render();
    const before = this.inspector.history.at(-1)?.id ?? 0;
    try {
      const work = this.inspector.evaluate(snapshot);
      this.traceId = this.inspector.history.find(
        (trace) => trace.id > before && trace.mode === "preview",
      )?.id;
      this.render();
      await work;
    } catch (error) {
      this.message(error);
    } finally {
      this.pending = false;
      this.render();
    }
  }

  // ===========================================
  // Rendering and export
  // ===========================================

  /** Preserve exact historical input even after the live mission advances. */
  private render(): void {
    if (!this.open) return;
    const traces = this.inspector.history.filter(
      (trace) => trace.snapshot.unitId === this.selected,
    );
    const trace = this.currentTrace();
    if (this.historySelect) {
      this.historySelect.replaceChildren();
      const current = this.historySelect.ownerDocument.createElement("option");
      current.value = "0";
      current.textContent = "Current captured state";
      this.historySelect.append(current);
      for (const item of [...traces].reverse()) {
        const option = this.historySelect.ownerDocument.createElement("option");
        option.value = String(item.id);
        option.textContent = `#${String(item.id)} · ${item.mode} · turn ${String(item.snapshot.turn)} ${item.snapshot.phase} · ${item.status}`;
        this.historySelect.append(option);
      }
      this.historySelect.value = String(this.traceId ?? 0);
    }
    const snapshot = trace?.snapshot ?? this.snapshot;
    if (snapshot && this.stateText && this.questionsText && this.outputText) {
      const request =
        trace?.exchanges.at(-1)?.request ?? jevChoicePage(snapshot).request;
      this.stateText.value = JSON.stringify(request.state, null, 2);
      this.questionsText.value = JSON.stringify(request.questions, null, 2);
      this.outputText.value = trace
        ? JSON.stringify(
            {
              status: trace.status,
              detail: trace.detail,
              chosen_action: trace.candidate
                ? {
                    id: trace.candidate.id,
                    category: trace.candidate.category,
                    description: trace.candidate.description,
                  }
                : undefined,
              answers: trace.exchanges.map((exchange) => ({
                answer: exchange.answer,
                elapsed_ms: exchange.elapsedMs,
                request_id: exchange.requestId,
              })),
              exchanges: trace.exchanges,
            },
            null,
            2,
          )
        : "No request sent. Evaluate to inspect Jev's answer. Automatic turns also appear in history.";
    }
    if (this.runButton)
      this.runButton.disabled =
        this.pending || !this.selected || !this.inspector.configured;
    if (this.rerunButton)
      this.rerunButton.disabled =
        this.pending || !snapshot || !this.inspector.configured;
    this.renderStatus();
  }

  /** Mark stale results instead of silently rebinding them to a new unit or turn. */
  private renderStatus(): void {
    const snapshot = this.currentTrace()?.snapshot ?? this.snapshot;
    const mission = this.inspector.mission();
    if (this.title)
      this.title.textContent = `Jev · ${this.selected ?? "No entity"} · ${snapshot?.team ?? ""}`;
    if (!this.status) return;
    if (!this.inspector.configured) {
      this.status.textContent =
        "Relay URL is not configured. State and questions can still be inspected.";
      return;
    }
    const stale =
      snapshot &&
      (snapshot.missionId !== mission?.missionId ||
        snapshot.commandSeq !== mission.commandSeq);
    this.status.textContent = `${this.pending ? "Evaluating… " : "Automatic play paused while this panel is open. "}${stale ? "Captured state is older than the battlefield. " : ""}${snapshot && !snapshot.eligible ? "Entity cannot act in this phase or has no AP; inspect its last actual decision in History. " : ""}Evaluate never executes the chosen action. Re-run keeps the captured battlefield and uses your draft prompts.`;
  }
  /** Look up the explicitly selected historical request. */
  private currentTrace(): JevTrace | undefined {
    return this.inspector.history.find((trace) => trace.id === this.traceId);
  }
  /** Export enough evidence to reproduce both input construction and model selection. */
  private exportText(): string {
    return JSON.stringify(
      this.currentTrace() ?? {
        snapshot: this.snapshot,
        request: this.snapshot
          ? jevChoicePage(this.snapshot).request
          : undefined,
      },
      null,
      2,
    );
  }
  /** Copy without introducing credentials or hidden game state. */
  private async copy(): Promise<void> {
    try {
      await this.panel?.ownerDocument.defaultView?.navigator.clipboard.writeText(
        this.exportText(),
      );
    } catch {
      this.message("Clipboard unavailable; use Export JSON.");
    }
  }
  /** Download a standalone trace artifact. */
  private download(): void {
    if (!this.panel) return;
    const url = URL.createObjectURL(
      new Blob([this.exportText()], { type: "application/json" }),
    );
    const anchor = this.panel.ownerDocument.createElement("a");
    anchor.href = url;
    anchor.download = `jev-${this.selected ?? "trace"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  /** Display operational failures where the user initiated the request. */
  private message(error: unknown): void {
    if (this.status)
      this.status.textContent =
        error instanceof Error ? error.message : String(error);
  }
}

/** A regular labelled button, kept out of the tactical input path by the HUD pointer guard. */
function button(
  doc: Document,
  label: string,
  run: () => void,
): HTMLButtonElement {
  const element = doc.createElement("button");
  element.type = "button";
  element.className = "tut-btn";
  element.textContent = label;
  element.addEventListener("click", run);
  return element;
}
/** A labelled, selectable text area suitable for copying exact JSON. */
function textarea(
  doc: Document,
  label: string,
  parent: HTMLElement,
  readonly = false,
): HTMLTextAreaElement {
  const wrapper = doc.createElement("label");
  wrapper.textContent = label;
  const input = doc.createElement("textarea");
  input.readOnly = readonly;
  input.spellcheck = false;
  input.setAttribute("aria-label", label);
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
