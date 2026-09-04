import type { GameOutcome } from "../../overworld/model/game-outcome";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the game-over screen needs from the app. */
export interface GameOverScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
}

/** Banner copy per outcome kind. */
interface OutcomeCopy {
  readonly title: string;
  readonly tagline: string;
  readonly tone: "danger" | "ok";
}

// ===========================================
// Constants
// ===========================================

/** Headline and explanation for each way a campaign ends (GDD §5.3). */
const OUTCOME_COPY: Readonly<Record<GameOutcome["kind"], OutcomeCopy>> = {
  defeat: {
    title: "Earth overrun",
    tagline:
      "The global threat reached its maximum. Terra Defence Force could not hold the line.",
    tone: "danger",
  },
  "victory-stub": {
    title: "Earth secured",
    tagline:
      "Every city is clean and no hive remains. The final mission arrives with M4; until then this is the victory.",
    tone: "ok",
  },
};

// ===========================================
// GameOverScreen
// ===========================================

/**
 * The end of a campaign (GDD §5.3): the outcome banner, the day it ended
 * and the summary frozen by the outcome service, with a way back to the
 * main menu. Reads the session's state once on mount; the campaign is
 * over, so nothing here changes.
 *
 * ```
 *   ┌ CAMPAIGN OVER ──────────────────────┐
 *   │ EARTH OVERRUN                        │
 *   │ The global threat reached …          │
 *   │ Day reached 41 · Cities lost 3/12 …  │
 *   │ [Return to main menu]                │
 *   └──────────────────────────────────────┘
 * ```
 */
export class GameOverScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "game-over";
  private readonly deps: GameOverScreenDeps;
  private panel: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router and the session whose ended campaign is shown. */
  constructor(deps: GameOverScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the panel from the session's outcome and wires the menu button. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const state: GameState | undefined = this.deps.session.state;
    const outcome = state?.overworld.outcome;

    // A scrim between the world and the verdict, toned by the outcome.
    // The panel borrows `.tut-menu`, which is the *title screen's*
    // treatment, so defeat was announced over a pristine blue-green
    // Earth dotted with healthy city markers -- "Earth overrun" said
    // over a picture of an Earth plainly not overrun. Victory keeps the
    // world bright, because there the picture and the words agree.
    const scrim = doc.createElement("div");
    scrim.className = "tut-game-over__scrim";
    scrim.dataset.tone = outcome ? OUTCOME_COPY[outcome.kind].tone : "ok";
    root.appendChild(scrim);
    this.disposers.push(() => {
      scrim.remove();
    });

    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-menu tut-game-over";
    panel.dataset.screen = this.id;

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Campaign over";

    panel.append(kicker, ...this.createBody(doc, outcome));

    const menu = doc.createElement("button");
    menu.type = "button";
    menu.className = "tut-btn tut-btn--primary";
    menu.dataset.action = "main-menu";
    menu.textContent = "Return to main menu";
    const onMenu = (): void => {
      this.deps.router.navigate("main-menu");
    };
    menu.addEventListener("click", onMenu);
    this.disposers.push(() => {
      menu.removeEventListener("click", onMenu);
    });
    const actions = doc.createElement("div");
    actions.className = "tut-stack";
    actions.appendChild(menu);
    panel.appendChild(actions);

    root.appendChild(panel);
    this.panel = panel;
  }

  /** Removes the panel and its listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.panel?.remove();
    this.panel = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** The banner and summary for `outcome`, or a note when no campaign has ended. */
  private createBody(
    doc: Document,
    outcome: GameOutcome | undefined,
  ): HTMLElement[] {
    if (!outcome) {
      const note = doc.createElement("p");
      note.className = "tut-dim";
      note.dataset.role = "no-outcome";
      note.textContent = "No campaign has ended.";
      return [note];
    }
    const copy = OUTCOME_COPY[outcome.kind];
    const title = doc.createElement("h1");
    title.className = `tut-game-over__title tut-game-over__title--${copy.tone}`;
    title.dataset.field = "outcome-kind";
    title.dataset.kind = outcome.kind;
    title.textContent = copy.title;

    const tagline = doc.createElement("p");
    tagline.className = "tut-dim";
    tagline.dataset.field = "outcome-tagline";
    tagline.textContent = copy.tagline;

    const { summary } = outcome;
    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    this.addField(doc, grid, "Day reached", "day", formatWhole(outcome.day));
    this.addField(
      doc,
      grid,
      "Cities lost",
      "cities-lost",
      `${formatWhole(summary.citiesLost)} / ${formatWhole(summary.citiesTotal)}`,
    );
    this.addField(
      doc,
      grid,
      "Cities infested",
      "cities-infested",
      `${formatWhole(summary.citiesInfested)} / ${formatWhole(summary.citiesTotal)}`,
    );
    this.addField(
      doc,
      grid,
      "Missions run",
      "missions-run",
      formatWhole(summary.missionsRun),
    );
    this.addField(
      doc,
      grid,
      "Final threat",
      "final-threat",
      formatWhole(summary.finalThreat),
    );
    return [title, tagline, grid];
  }

  /** Appends a label/value pair to `grid`; the value carries `data-field` for tests. */
  private addField(
    doc: Document,
    grid: HTMLElement,
    label: string,
    field: string,
    value: string,
  ): void {
    const term = doc.createElement("dt");
    term.className = "tut-label";
    term.textContent = label;
    const cell = doc.createElement("dd");
    cell.className = "tut-mono";
    cell.dataset.field = field;
    cell.textContent = value;
    grid.append(term, cell);
  }
}
