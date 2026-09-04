import { advanceDay } from "../../overworld/model/advance-day-command";
import type {
  MissionOutcome,
  MissionResult,
} from "../../overworld/model/mission-result";
import type {
  GraveyardEntry,
  RosterState,
} from "../../roster/model/roster-state";
import type { GameState } from "../../save/model/game-state";
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

/** Banner copy per outcome. */
interface OutcomeCopy {
  readonly title: string;
  readonly tagline: string;
  readonly tone: "ok" | "warn" | "danger";
}

// ===========================================
// Constants
// ===========================================

/** Headline and explanation for each way a mission ends (GDD §6.5). */
const OUTCOME_COPY: Readonly<Record<MissionOutcome, OutcomeCopy>> = {
  won: {
    title: "Mission accomplished",
    tagline: "Objectives complete. The force is coming home with full rewards.",
    tone: "ok",
  },
  extracted: {
    title: "Force extracted",
    tagline:
      "The force pulled out before finishing. Survivors are coming home.",
    tone: "warn",
  },
  lost: {
    title: "Mission lost",
    tagline:
      "The force was wiped or the mission failed. Nothing was extracted.",
    tone: "danger",
  },
};

// ===========================================
// MissionResultsScreen
// ===========================================

/**
 * The debrief after a mission (GDD §6.5): the outcome banner, then the
 * losses with destroyed mechs given top billing because losing one
 * should be devastating and memorable (GDD §5.8), wiped squads, every
 * surviving squad's casualties, every surviving mech's damage, and the
 * credits and infestation change. Names for the dead come from the
 * graveyard (the roster no longer holds them); names for survivors come
 * from the roster. Continue dispatches `AdvanceDay` and returns to the
 * overworld; a rejected tick (the campaign has ended) is shown and the
 * screen still returns so the game-over routing can take over.
 *
 * ```
 *   ┌ MISSION RESULTS ─────────────────────────────────┐
 *   │ MISSION ACCOMPLISHED · mission-4                   │
 *   │ ▌ MECHS DESTROYED   Hammerhead                     │
 *   │   Squads wiped      Bravo                          │
 *   │   Casualties        Alpha −2 (3/5)                 │
 *   │   Mech damage       Anvil +35 (35/100)             │
 *   │   Credits ¢1,500 · Infestation −20                 │
 *   │ [Continue]                                         │
 *   └────────────────────────────────────────────────────┘
 * ```
 */
export class MissionResultsScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "mission-results";
  private readonly deps: MissionResultsScreenDeps;
  private root: HTMLElement | undefined;
  private status: HTMLElement | undefined;
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

  /** Builds the debrief from the last mission result; the result is frozen, so it renders once. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-menu tut-mission-results";
    panel.dataset.screen = this.id;

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Mission results";
    panel.appendChild(kicker);

    const state = this.deps.session.state;
    const result = state?.overworld.lastMissionResult;
    if (state && result) {
      this.renderResult(doc, panel, state, result);
    } else {
      const title = doc.createElement("h1");
      title.dataset.field = "outcome";
      title.textContent = "No result";
      const note = doc.createElement("p");
      note.className = "tut-dim";
      note.textContent = "No mission has been resolved yet.";
      panel.append(title, note);
    }

    const status = doc.createElement("p");
    status.className = "tut-menu__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;

    const next = doc.createElement("button");
    next.type = "button";
    next.className = "tut-btn tut-btn--primary";
    next.dataset.action = "continue";
    next.textContent = "Continue";
    this.listen(next, () => {
      this.continueToOverworld();
    });

    panel.append(status, next);
    root.appendChild(panel);
    this.root = panel;
    this.status = status;
  }

  /** Removes the panel and its listeners. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.status = undefined;
  }

  // ===========================================
  // Actions
  // ===========================================

  /**
   * Advances the day, then returns to the overworld. A rejected tick is
   * reported in the status line but does not trap the player here.
   */
  private continueToOverworld(): void {
    const store = this.deps.session.store;
    if (store) {
      const outcome = store.dispatch(advanceDay());
      if (!outcome.ok && this.status) {
        this.status.textContent = outcome.error.message;
        this.status.hidden = false;
      }
    }
    this.deps.router.navigate("overworld");
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** The banner, the loss sections in billing order, and the rewards row. */
  private renderResult(
    doc: Document,
    panel: HTMLElement,
    state: GameState,
    result: MissionResult,
  ): void {
    const copy = OUTCOME_COPY[result.outcome];
    const title = doc.createElement("h1");
    title.className = `tut-mission-results__title tut-mission-results__title--${copy.tone}`;
    title.dataset.field = "outcome";
    title.dataset.outcome = result.outcome;
    title.dataset.tone = copy.tone;
    title.textContent = copy.title;
    const tagline = doc.createElement("p");
    tagline.className = "tut-dim";
    tagline.textContent = copy.tagline;
    const mission = doc.createElement("p");
    mission.className = "tut-mono";
    mission.dataset.field = "mission-id";
    mission.textContent = result.missionId;
    panel.append(title, tagline, mission);

    const graves = state.roster.graveyard.filter(
      (g) => g.missionId === result.missionId,
    );
    const roster = state.roster;

    panel.appendChild(
      this.section(
        doc,
        "Mechs destroyed",
        "mechs-destroyed",
        lostNames(result.mechsDestroyed, "mech", graves, roster),
        "No mechs lost.",
        true,
      ),
    );
    panel.appendChild(
      this.section(
        doc,
        "Squads wiped",
        "squads-wiped",
        lostNames(result.squadsWiped, "squad", graves, roster),
        "No squads lost.",
        false,
      ),
    );
    panel.appendChild(
      this.section(
        doc,
        // Say whose casualties these are when some squads are not among
        // them: with a squad wiped, "Casualties: Bravo −2" otherwise
        // reads as two lost when seven were (#480).
        result.squadsWiped.length > 0
          ? "Casualties (surviving squads)"
          : "Casualties",
        "casualties",
        result.squadCasualties
          .filter(
            (c) => c.losses > 0 && !result.squadsWiped.includes(c.squadId),
          )
          .map((c) => {
            const squad = roster.squads.find((s) => s.id === c.squadId);
            const strength = squad
              ? ` (${formatWhole(squad.strength)}/${formatWhole(squad.maxStrength)})`
              : "";
            return `${squad?.name ?? c.squadId} −${formatWhole(c.losses)}${strength}`;
          }),
        // A wiped squad is listed in its own row above, so it is left out
        // of this one to avoid counting it twice. When every squad went
        // that way this row is empty, and "No casualties" then flatly
        // contradicts the line above it (#480) — so say what is missing.
        result.squadsWiped.length > 0
          ? "No further casualties."
          : "No casualties.",
        false,
      ),
    );
    panel.appendChild(
      this.section(
        doc,
        result.mechsDestroyed.length > 0
          ? "Mech damage (surviving mechs)"
          : "Mech damage",
        "mech-damage",
        result.mechDamage
          .filter(
            (d) => d.damage > 0 && !result.mechsDestroyed.includes(d.mechId),
          )
          .map((d) => {
            const mech = roster.mechs.find((m) => m.id === d.mechId);
            const total = mech ? ` (${formatWhole(mech.damage)}/100)` : "";
            return `${mech?.name ?? d.mechId} +${formatWhole(d.damage)}${total}`;
          }),
        // Same reasoning as casualties: a destroyed mech is its own row.
        result.mechsDestroyed.length > 0
          ? "No damage among surviving mechs."
          : "No damage taken.",
        false,
      ),
    );

    const rewards = doc.createElement("dl");
    rewards.className = "tut-kv";
    for (const [label, field, value] of [
      ["Credits", "credits", formatCredits(result.creditsAwarded)],
      [
        "Infestation",
        "infestation-delta",
        `${result.infestationDelta > 0 ? "+" : ""}${formatWhole(result.infestationDelta)}`,
      ],
    ] as const) {
      const term = doc.createElement("dt");
      term.className = "tut-label";
      term.textContent = label;
      const detail = doc.createElement("dd");
      detail.className = "tut-mono";
      detail.dataset.field = field;
      detail.textContent = value;
      rewards.append(term, detail);
    }
    panel.appendChild(rewards);
  }

  /** A titled list; `prominent` gives the destroyed-mechs block its top billing. */
  private section(
    doc: Document,
    label: string,
    field: string,
    items: readonly string[],
    emptyText: string,
    prominent: boolean,
  ): HTMLElement {
    const block = doc.createElement("div");
    block.className = prominent
      ? "tut-mission-results__section tut-mission-results__section--prominent"
      : "tut-mission-results__section";
    block.dataset.field = field;
    block.dataset.count = String(items.length);
    const heading = doc.createElement("div");
    heading.className = prominent
      ? "tut-label tut-mission-results__loss"
      : "tut-label";
    heading.textContent = label;
    block.appendChild(heading);
    if (items.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "tut-dim";
      empty.textContent = emptyText;
      block.appendChild(empty);
      return block;
    }
    const list = doc.createElement("ul");
    list.className = "tut-list";
    for (const item of items) {
      const li = doc.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    }
    block.appendChild(list);
    return block;
  }

  /** Attaches a click handler and remembers how to remove it. */
  private listen(target: HTMLElement, handler: () => void): void {
    target.addEventListener("click", handler);
    this.disposers.push(() => {
      target.removeEventListener("click", handler);
    });
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Names for lost units. A unit still in the roster (casualties not yet
 * applied) keeps its name; otherwise each id takes the next unused grave
 * of its kind from this mission, in order, since graves carry names
 * rather than ids. Falls back to the id when the graveyard runs short.
 */
function lostNames(
  ids: readonly string[],
  kind: GraveyardEntry["kind"],
  graves: readonly GraveyardEntry[],
  roster: RosterState,
): string[] {
  const units: readonly { id: string; name: string }[] =
    kind === "mech" ? roster.mechs : roster.squads;
  const queue = graves.filter((g) => g.kind === kind).map((g) => g.name);
  return ids.map((id) => {
    const live = units.find((u) => u.id === id);
    if (live) {
      return live.name;
    }
    return queue.shift() ?? id;
  });
}
