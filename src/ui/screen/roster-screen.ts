import type { Unsubscribe } from "../../core/model/event-bus";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import {
  hireSquad,
  reinforceSquad,
} from "../../overworld/model/overworld-command";
import { renameMech } from "../../overworld/model/rename-mech-command";
import { repairMech } from "../../overworld/model/repair-mech-command";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { RosterTuning } from "../../roster/model/roster-tuning";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatCredits } from "../service/format";
import { GraveyardView } from "../view/graveyard-view";
import { MechListView } from "../view/mech-list-view";
import { SquadListView } from "../view/squad-list-view";

// ===========================================
// Types
// ===========================================

/** What the roster screen needs from the app. */
export interface RosterScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Names and prices squad types. */
  readonly squadTypes: SquadTypeCatalogue;
  /** Names the parts in each mech's loadout summary. */
  readonly parts: PartCatalogue;
  /** Repair pricing. */
  readonly rosterTuning: RosterTuning;
}

// ===========================================
// RosterScreen
// ===========================================

/**
 * The roster (GDD §5.7): squads, mechs and the graveyard, with hire,
 * reinforce, repair and rename dispatched through the campaign store.
 * Every store change re-renders the three views; a rejected command is
 * shown in the header's status line, never thrown.
 *
 * ```
 *   ┌ #roster-bar  ROSTER  ¢5,000 ── status ── [Mech bay] [Overworld] ┐
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ #squad-list   rows + hire form                                   │
 *   │ #mech-list    rows with repair and rename                        │
 *   │ #graveyard    permanent losses                                   │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 *   view handlers ──► store.dispatch(command) ──err──► status line
 *   store.subscribe ──► views.update(state)
 * ```
 *
 * The Mech Bay button is present but disabled until the mech bay screen
 * (#80) registers, mirroring how the overworld bar shipped its Roster
 * button before this screen existed.
 */
export class RosterScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "roster";
  private readonly deps: RosterScreenDeps;
  private readonly squads: SquadListView;
  private readonly mechs: MechListView;
  private readonly graveyard = new GraveyardView();
  private root: HTMLElement | undefined;
  private credits: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session and the content the views label things with. */
  constructor(deps: RosterScreenDeps) {
    this.deps = deps;
    this.squads = new SquadListView(
      {
        onHire: (typeId, name) => {
          this.dispatch(hireSquad(typeId, name));
        },
        onReinforce: (squadId, soldiers) => {
          this.dispatch(reinforceSquad(squadId, soldiers));
        },
      },
      deps.squadTypes,
    );
    this.mechs = new MechListView(
      {
        onRepair: (mechId) => {
          this.dispatch(repairMech(mechId));
        },
        onRename: (mechId, name) => {
          this.dispatch(renameMech(mechId, name));
        },
      },
      { parts: deps.parts, tuning: deps.rosterTuning },
    );
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the layout, mounts the views and subscribes to the campaign store. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-roster";
    layout.dataset.screen = this.id;

    layout.appendChild(this.createBar(doc));
    const body = doc.createElement("div");
    body.className = "tut-roster__body";
    this.squads.mount(body);
    this.mechs.mount(body);
    this.graveyard.mount(body);
    layout.appendChild(body);

    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
  }

  /** Unsubscribes, unmounts the views and removes the layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.squads.unmount();
    this.mechs.unmount();
    this.graveyard.unmount();
    this.root?.remove();
    this.root = undefined;
    this.credits = undefined;
    this.status = undefined;
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Runs a command through the store; a rejection lands in the status line. */
  private dispatch(command: OverworldCommand): void {
    const store = this.deps.session.store;
    if (!store) {
      this.showStatus("No active campaign.");
      return;
    }
    const result = store.dispatch(command);
    if (!result.ok) {
      this.showStatus(result.error.message);
    } else {
      this.showStatus("");
    }
  }

  /** Shows a one-line message in the bar, or hides the line when empty. */
  private showStatus(message: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.hidden = message === "";
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** Pushes the state into the header and the three views. */
  private render(state: GameState | undefined): void {
    if (this.credits) {
      this.credits.textContent = state
        ? formatCredits(state.economy.credits)
        : "—";
    }
    if (!state) {
      this.showStatus("No active campaign.");
      return;
    }
    const model = { roster: state.roster, credits: state.economy.credits };
    this.squads.update(model);
    this.mechs.update(model);
    this.graveyard.update(state.roster.graveyard);
  }

  /** The header: title, credits, status line and navigation. */
  private createBar(doc: Document): HTMLElement {
    const bar = doc.createElement("header");
    bar.id = "roster-bar";
    bar.className = "tut-topbar tut-roster__bar";

    const title = doc.createElement("span");
    title.className = "tut-label";
    title.textContent = "Roster";

    const credits = doc.createElement("span");
    credits.className = "tut-data";
    credits.dataset.field = "credits";
    credits.textContent = "—";

    const spacer = doc.createElement("span");
    spacer.className = "tut-topbar__spacer";

    const status = doc.createElement("span");
    status.className = "tut-topbar__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;

    const mechBay = this.createButton(doc, "mech-bay", "Mech bay");
    mechBay.disabled = true;
    mechBay.title = "The mech bay arrives with #80";
    const overworld = this.createButton(doc, "overworld", "Overworld");
    this.listen(overworld, () => {
      this.deps.router.navigate("overworld");
    });

    bar.append(title, credits, spacer, status, mechBay, overworld);
    this.credits = credits;
    this.status = status;
    return bar;
  }

  /** A themed button carrying its `data-action`. */
  private createButton(
    doc: Document,
    action: string,
    label: string,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tut-btn";
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  /** Attaches a click handler and remembers how to remove it. */
  private listen(target: HTMLElement, handler: () => void): void {
    target.addEventListener("click", handler);
    this.disposers.push(() => {
      target.removeEventListener("click", handler);
    });
  }
}
