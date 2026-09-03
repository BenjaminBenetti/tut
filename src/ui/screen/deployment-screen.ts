import type { GameSession } from "../model/game-session";
import type { OverworldSelection } from "../model/overworld-selection";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";

// ===========================================
// Types
// ===========================================

/** What the deployment screen needs from the app. */
export interface DeploymentScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Carries the mission the player chose on the overworld. */
  readonly selection: OverworldSelection;
}

// ===========================================
// DeploymentScreen
// ===========================================

/**
 * Placeholder deployment screen: names the mission that was chosen on
 * the overworld and offers a way back. The unit picker and launch
 * button land with #82; the id, deps and lifecycle stay.
 */
export class DeploymentScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "deployment";
  private readonly deps: DeploymentScreenDeps;
  private root: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session and the shared selection. */
  constructor(deps: DeploymentScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the placeholder panel from the selected mission. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-menu";
    panel.dataset.screen = this.id;

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Deployment · placeholder";

    const title = doc.createElement("h1");
    title.textContent = "Plan deployment";

    const missionId = this.deps.selection.selection.missionId;
    const mission = missionId
      ? this.deps.session.state?.overworld.missions.find(
          (m) => m.id === missionId,
        )
      : undefined;

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    const idTerm = doc.createElement("dt");
    idTerm.className = "tut-label";
    idTerm.textContent = "Mission";
    const idValue = doc.createElement("dd");
    idValue.className = "tut-mono";
    idValue.dataset.field = "mission-id";
    idValue.textContent = mission?.id ?? "—";
    const cityTerm = doc.createElement("dt");
    cityTerm.className = "tut-label";
    cityTerm.textContent = "City";
    const cityValue = doc.createElement("dd");
    cityValue.className = "tut-mono";
    cityValue.dataset.field = "city-id";
    cityValue.textContent = mission?.cityId ?? "—";
    grid.append(idTerm, idValue, cityTerm, cityValue);

    const note = doc.createElement("p");
    note.className = "tut-dim";
    note.textContent = mission
      ? "Unit selection and launch arrive with #82."
      : "No mission selected. Pick one on the overworld.";

    const back = doc.createElement("button");
    back.type = "button";
    back.className = "tut-btn";
    back.dataset.action = "back-to-overworld";
    back.textContent = "Back to overworld";

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
