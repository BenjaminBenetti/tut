import type { GameOutcome } from "../../overworld/model/game-outcome";
import type { RankLadder } from "../../roster/model/rank";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { outcomeCopy } from "../service/outcome-copy";
import { ChronicleTimelineView } from "../view/chronicle-timeline-view";
import { NemesisFatesView } from "../view/nemesis-fates-view";
import { OutcomeNumbersView } from "../view/outcome-numbers-view";
import { SquadRollView } from "../view/squad-roll-view";

// ===========================================
// Types
// ===========================================

/** What the game-over screen needs from the app. */
export interface GameOverScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Public base the key art is served under (`import.meta.env.BASE_URL`); `/` by default. */
  readonly baseUrl?: string;
  /** The rank ladder, to name each roll entry's rank; the roll omits ranks without it. */
  readonly ranks?: RankLadder;
}

/** A mounted part of the panel, removed on unmount. */
interface Unmountable {
  /** Removes what the view mounted. */
  unmount(): void;
}

// ===========================================
// GameOverScreen
// ===========================================

/**
 * The end of a campaign (GDD §5.3, campaign arc §13): the verdict, the
 * final numbers, the chronicle of acts, the squad roll and the nemeses,
 * all read from the summary the outcome service froze, with the one way
 * out to the main menu. Reads the session's state once on mount; the
 * campaign is over, so nothing here changes.
 *
 * A platform victory stands over its key art with the panel in the
 * art's quiet right third; every other ending sits centred over the
 * world, drained by the scrim on a defeat. An outcome saved before the
 * chronicle has only the numbers, and renders with those alone.
 *
 * ```
 *   ┌ key art ───────────────────────┬ CAMPAIGN OVER ─────────────┐
 *   │  platform breaking up          │ VICTORY                     │
 *   │                                │ The platform burns in orbit │
 *   │                                │ Day · Missions · Threat     │
 *   │                                │ Saved · Lost · Infested     │
 *   │                                │ ┌ Chronicle (scrolls) ────┐ │
 *   │  mechs on the rubble           │ │ Act I … Finale          │ │
 *   │                                │ └─────────────────────────┘ │
 *   │                                │ Nemeses: Old Scald … killed │
 *   │                                │ Squad roll (scrolls)        │
 *   │                                │ [Return to main menu]       │
 *   └────────────────────────────────┴─────────────────────────────┘
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

  /** @param deps - Router, the session whose ended campaign is shown, and the art's base. */
  constructor(deps: GameOverScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the backdrop and panel from the session's outcome and wires the menu button. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const state: GameState | undefined = this.deps.session.state;
    const outcome = state?.overworld.outcome;
    const copy = outcome
      ? outcomeCopy(outcome, state?.overworld.progress.act)
      : undefined;

    if (copy?.art !== undefined) {
      this.addBackdrop(root, copy.art);
    }

    // A scrim between the world and the verdict, toned by the outcome.
    // Draining the colour is the honest backdrop for a lost world: a
    // bright Earth dotted with healthy cities flatly denied the words.
    // Victory keeps the world (or the key art) as it is.
    const scrim = doc.createElement("div");
    scrim.className = "tut-game-over__scrim";
    scrim.dataset.tone = copy?.tone ?? "ok";
    root.appendChild(scrim);
    this.disposers.push(() => {
      scrim.remove();
    });

    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-game-over";
    panel.dataset.screen = this.id;
    panel.dataset.art = copy?.art === undefined ? "none" : "key-art";
    if (copy !== undefined) {
      panel.dataset.variant = copy.variant;
    }

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Campaign over";
    panel.appendChild(kicker);

    if (outcome === undefined || copy === undefined) {
      const note = doc.createElement("p");
      note.className = "tut-dim";
      note.dataset.role = "no-outcome";
      note.textContent = "No campaign has ended.";
      panel.appendChild(note);
    } else {
      this.addHeadline(panel, outcome, copy.title, copy.tagline, copy.tone);
      this.addRecord(panel, outcome);
    }

    panel.appendChild(this.createMenuButton(doc));
    root.appendChild(panel);
    this.panel = panel;
  }

  /** Removes the backdrop, the panel, its views and its listener. */
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

  /** The key art, full-bleed behind everything; decorative, so no alt text. */
  private addBackdrop(root: HTMLElement, path: string): void {
    const art = root.ownerDocument.createElement("img");
    art.className = "tut-game-over__art";
    art.dataset.role = "outcome-art";
    art.alt = "";
    art.decoding = "async";
    art.src = `${this.deps.baseUrl ?? "/"}${path}`;
    root.appendChild(art);
    this.disposers.push(() => {
      art.remove();
    });
  }

  /** The verdict and its tagline. */
  private addHeadline(
    panel: HTMLElement,
    outcome: GameOutcome,
    titleText: string,
    taglineText: string,
    tone: "danger" | "ok",
  ): void {
    const doc = panel.ownerDocument;
    const title = doc.createElement("h1");
    title.className = `tut-game-over__title tut-game-over__title--${tone}`;
    title.dataset.field = "outcome-kind";
    title.dataset.kind = outcome.kind;
    title.textContent = titleText;

    const tagline = doc.createElement("p");
    tagline.className = "tut-game-over__tagline";
    tagline.dataset.field = "outcome-tagline";
    tagline.textContent = taglineText;
    panel.append(title, tagline);
  }

  /**
   * The numbers, then whatever of the chronicle the summary kept: the
   * timeline of acts, the nemeses and the squad roll.
   */
  private addRecord(panel: HTMLElement, outcome: GameOutcome): void {
    const { summary } = outcome;
    this.track(new OutcomeNumbersView(), (view) => {
      view.mount(panel, outcome);
    });
    if (summary.acts !== undefined && summary.acts.length > 0) {
      const acts = summary.acts;
      this.track(new ChronicleTimelineView(), (view) => {
        view.mount(panel, {
          acts,
          ...(summary.storyWins === undefined
            ? {}
            : { storyWins: summary.storyWins }),
        });
      });
    }
    if (summary.squad === undefined && summary.nemeses === undefined) {
      return;
    }
    const record = panel.ownerDocument.createElement("div");
    record.className = "tut-game-over__record";
    // The nemeses first: a line or two that never scrolls, above the
    // roll that may.
    const nemeses = summary.nemeses;
    if (nemeses !== undefined) {
      this.track(new NemesisFatesView(), (view) => {
        view.mount(record, nemeses);
      });
    }
    const squad = summary.squad;
    if (squad !== undefined) {
      this.track(new SquadRollView(this.deps.ranks), (view) => {
        view.mount(record, squad);
      });
    }
    panel.appendChild(record);
  }

  /** The one way out: back to the main menu. */
  private createMenuButton(doc: Document): HTMLElement {
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
    actions.className = "tut-stack tut-game-over__actions";
    actions.appendChild(menu);
    return actions;
  }

  /** Mounts `view` through `mount` and unmounts it with the screen. */
  private track<V extends Unmountable>(
    view: V,
    mount: (view: V) => void,
  ): void {
    mount(view);
    this.disposers.push(() => {
      view.unmount();
    });
  }
}
