import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatCredits, formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the results screen needs from the app. */
export interface MissionResultsScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
}

// ===========================================
// MissionResultsScreen
// ===========================================

/**
 * Placeholder results screen: the outcome and headline numbers of
 * `overworld.lastMissionResult`, and Continue back to the overworld.
 * The full debrief (casualties by unit, graveyard, rewards breakdown)
 * lands with #83; the id, deps and lifecycle stay.
 */
export class MissionResultsScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "mission-results";
  private readonly deps: MissionResultsScreenDeps;
  private root: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router and the session holding the last result. */
  constructor(deps: MissionResultsScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the results panel from the last mission result. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-menu tut-mission-results";
    panel.dataset.screen = this.id;

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Mission results · placeholder";

    const result = this.deps.session.state?.overworld.lastMissionResult;
    const title = doc.createElement("h1");
    title.dataset.field = "outcome";
    title.textContent = result ? `Mission ${result.outcome}` : "No result";

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    const rows: [string, string, string][] = result
      ? [
          ["Mission", "mission-id", result.missionId],
          ["Credits", "credits", formatCredits(result.creditsAwarded)],
          [
            "Squads wiped",
            "squads-wiped",
            formatWhole(result.squadsWiped.length),
          ],
          [
            "Mechs destroyed",
            "mechs-destroyed",
            formatWhole(result.mechsDestroyed.length),
          ],
          [
            "Infestation",
            "infestation-delta",
            `${result.infestationDelta > 0 ? "+" : ""}${formatWhole(result.infestationDelta)}`,
          ],
        ]
      : [];
    for (const [label, field, value] of rows) {
      const term = doc.createElement("dt");
      term.className = "tut-label";
      term.textContent = label;
      const detail = doc.createElement("dd");
      detail.className = "tut-mono";
      detail.dataset.field = field;
      detail.textContent = value;
      grid.append(term, detail);
    }

    const note = doc.createElement("p");
    note.className = "tut-dim";
    note.textContent = result
      ? "The full debrief arrives with #83."
      : "No mission has been resolved yet.";

    const back = doc.createElement("button");
    back.type = "button";
    back.className = "tut-btn tut-btn--primary";
    back.dataset.action = "continue";
    back.textContent = "Continue";

    panel.append(kicker, title, grid, note, back);
    root.appendChild(panel);

    const handler = (): void => {
      this.deps.router.navigate("overworld");
    };
    back.addEventListener("click", handler);
    this.disposers.push(() => {
      back.removeEventListener("click", handler);
    });
    this.root = panel;
  }

  /** Removes the panel and its listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
  }
}
