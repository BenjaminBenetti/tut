import type { Unsubscribe } from "../../core/model/event-bus";
import type { GameState } from "../../save/model/game-state";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import type { TacticalIntent } from "../model/tactical-intent";
import type { TacticalSceneHost } from "../model/tactical-scene-host";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the tactical screen needs from the app. */
export interface TacticalScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Builds and owns the three.js scene for the mission; absent in unit tests that only check the DOM. */
  readonly sceneHost?: TacticalSceneHost;
  /**
   * Receives every intent from the input controller. #T4.x maps them to
   * tactical commands; until then the screen records the last one on the
   * body for the Playwright specs.
   */
  readonly onIntent?: (intent: TacticalIntent) => void;
}

// ===========================================
// TacticalScreen
// ===========================================

/**
 * The tactical mission screen (GDD §6): a status bar with the mission,
 * turn, phase and unit counts over a viewport the scene host renders
 * into. Reads `activeMission` from the campaign store and re-renders
 * on every change; the rules issues add the action bar and the intent
 * to command mapping (#T4.x). With no mission in progress it says so
 * and offers the overworld.
 *
 * ```
 *   ┌ #tactical-bar  MISSION mission-4 · TURN 1 · PLAYER  TDF 3 / BUGS 1  [Overworld] ┐
 *   ├──────────────────────────────────────────────────────────────────────────────────┤
 *   │ #tactical-viewport  ◄── sceneHost.attach / update                                 │
 *   └──────────────────────────────────────────────────────────────────────────────────┘
 * ```
 */
export class TacticalScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "tactical";
  private readonly deps: TacticalScreenDeps;
  private root: HTMLElement | undefined;
  private viewport: HTMLElement | undefined;
  private fields = new Map<string, HTMLElement>();
  private note: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private attachedMissionId: string | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, scene host and the intent sink. */
  constructor(deps: TacticalScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the bar and viewport, attaches the scene and subscribes to the store. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-tactical";
    layout.dataset.screen = this.id;
    layout.appendChild(this.createBar(doc));

    const viewport = doc.createElement("div");
    viewport.id = "tactical-viewport";
    viewport.className = "tut-tactical__viewport";
    layout.appendChild(viewport);

    const note = doc.createElement("p");
    note.className = "tut-dim tut-tactical__note";
    note.dataset.role = "no-mission";
    note.textContent = "No mission in progress.";
    note.hidden = true;
    layout.appendChild(note);

    root.appendChild(layout);
    this.root = layout;
    this.viewport = viewport;
    this.note = note;

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
  }

  /** Unsubscribes, releases the scene and removes the layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.deps.sceneHost?.release();
    this.attachedMissionId = undefined;
    this.root?.remove();
    this.root = undefined;
    this.viewport = undefined;
    this.note = undefined;
    this.fields = new Map();
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** Pushes the mission into the bar and the scene host. */
  private render(state: GameState | undefined): void {
    const mission = state?.activeMission;
    if (this.note) {
      this.note.hidden = mission !== undefined;
    }
    if (!mission) {
      this.setField("mission-id", "—");
      this.setField("turn", "—");
      this.setField("phase", "—");
      this.setField("tdf-units", "—");
      this.setField("bug-units", "—");
      return;
    }
    this.setField("mission-id", mission.missionId);
    this.setField("turn", formatWhole(mission.turn));
    this.setField("phase", mission.phase);
    this.setField("tdf-units", formatWhole(countAlive(mission, "tdf")));
    this.setField("bug-units", formatWhole(countAlive(mission, "bugs")));
    this.syncScene(mission);
  }

  /** Attaches the scene on the first mission, updates it afterwards; never throws into the store. */
  private syncScene(mission: TacticalState): void {
    const host = this.deps.sceneHost;
    if (!host || !this.viewport) {
      return;
    }
    const intents = {
      emit: (intent: TacticalIntent): void => {
        this.recordIntent(intent);
        this.deps.onIntent?.(intent);
      },
    };
    const pending =
      this.attachedMissionId === mission.missionId
        ? host.update(mission)
        : host.attach(this.viewport, mission, intents);
    this.attachedMissionId = mission.missionId;
    void pending.catch((error: unknown) => {
      console.error("Tactical scene failed", error);
    });
  }

  /** Mirrors the last intent to the body so end-to-end tests can watch it. */
  private recordIntent(intent: TacticalIntent): void {
    const body = this.root?.ownerDocument.body;
    if (!body) {
      return;
    }
    body.dataset.lastIntent =
      intent.kind === "action" ? intent.action : intent.kind;
    if (intent.kind === "select-unit") {
      body.dataset.selectedUnit = intent.unitId;
    }
    if (intent.kind === "select-tile") {
      body.dataset.selectedTile = `${intent.tile.x},${intent.tile.y},${intent.tile.z}`;
    }
  }

  /** The status bar: mission, turn, phase, unit counts and the way out. */
  private createBar(doc: Document): HTMLElement {
    const bar = doc.createElement("header");
    bar.id = "tactical-bar";
    bar.className = "tut-topbar tut-tactical__bar";
    for (const [label, field] of [
      ["Mission", "mission-id"],
      ["Turn", "turn"],
      ["Phase", "phase"],
      ["TDF", "tdf-units"],
      ["Bugs", "bug-units"],
    ] as const) {
      const stat = doc.createElement("span");
      stat.className = "tut-topbar__stat";
      const term = doc.createElement("span");
      term.className = "tut-label";
      term.textContent = label;
      const value = doc.createElement("span");
      value.className = "tut-data";
      value.dataset.field = field;
      value.textContent = "—";
      stat.append(term, value);
      bar.appendChild(stat);
      this.fields.set(field, value);
    }
    const spacer = doc.createElement("span");
    spacer.className = "tut-topbar__spacer";
    const overworld = doc.createElement("button");
    overworld.type = "button";
    overworld.className = "tut-btn";
    overworld.dataset.action = "overworld";
    overworld.textContent = "Overworld";
    const onOverworld = (): void => {
      this.deps.router.navigate("overworld");
    };
    overworld.addEventListener("click", onOverworld);
    this.disposers.push(() => {
      overworld.removeEventListener("click", onOverworld);
    });
    bar.append(spacer, overworld);
    return bar;
  }

  /** Writes a bar value when it changed. */
  private setField(field: string, text: string): void {
    const el = this.fields.get(field);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** Living units on one team. */
function countAlive(mission: TacticalState, team: "tdf" | "bugs"): number {
  return mission.units.filter((u) => u.team === team && u.hp > 0).length;
}
