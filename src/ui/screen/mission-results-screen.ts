import { advanceDay } from "../../overworld/model/advance-day-command";
import type {
  MissionOutcome,
  MissionResult,
} from "../../overworld/model/mission-result";
import type {
  GraveyardEntry,
  RosterState,
} from "../../roster/model/roster-state";
import type { RosterTuning } from "../../roster/model/roster-tuning";
import {
  promotionBetween,
  rankIndexOf,
  rankOf,
} from "../../roster/service/rank-service";
import { attachRankTooltip } from "../view/rank-tooltip-view";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatCredits, formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** One list item on the debrief; a rank at its end carries the rank popover (#1134). */
interface DebriefLine {
  readonly text: string;
  readonly rank?: { readonly name: string; readonly index: number };
}

// ===========================================
// Types
// ===========================================

/** What the results screen needs from the app. */
export interface MissionResultsScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** The rank ladder and the per-mission experience, to read a promotion back off the roster (#1130). */
  readonly rosterTuning: RosterTuning;
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
      "The force was wiped, or the mission was left with its objectives open.",
    tone: "danger",
  },
};

/**
 * Shown when a stored result names a city the map no longer has — only
 * reachable from a hand-edited save, since the migration for #739 drops
 * results that predate `cityId` rather than leaving them to fall here.
 */
const UNKNOWN_CITY = "Unknown city";

// ===========================================
// MissionResultsScreen
// ===========================================

/**
 * The debrief after a mission (GDD §6.5): the outcome banner, then the
 * losses with destroyed mechs given top billing because losing one
 * should be devastating and memorable (GDD §5.8), wiped squads, every
 * surviving squad's casualties, every surviving mech's damage, the
 * experience the kills earned with any promotion (#1130), and the
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
 *   │   Experience        Alpha +30 xp · promoted to Corporal │
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

  /** @param deps - Router, the session holding the last result, and the roster tuning. */
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
    // The city, not the id (#739). The player chose this mission from a
    // list that called it Seoul; the screen they land on afterwards has
    // to agree. `cityId` is carried on the result because the mission
    // itself is removed from the offers in the same update that stores
    // it, so there is nothing left to look the name up through.
    const mission = doc.createElement("p");
    mission.className = "tut-mono";
    mission.dataset.field = "mission-city";
    mission.textContent =
      state.overworld.map.cities.find((c) => c.id === result.cityId)?.name ??
      UNKNOWN_CITY;
    panel.append(title, tagline, mission);

    const graves = state.roster.graveyard.filter(
      (g) => g.missionId === result.missionId,
    );
    const roster = state.roster;
    // "Cost nothing" means no mech destroyed **and** no squad wiped. A
    // wiped squad is a loss too (GDD §5.8), and lifting a payout over it
    // would be the same inversion in miniature that this issue exists to
    // avoid — smaller only because a squad is cheaper than a mech.
    const lossless =
      result.mechsDestroyed.length === 0 && result.squadsWiped.length === 0;

    // Who was left on the map when the player left (#1132), named
    // before the casualty rows: they are in those rows too, as wiped or
    // destroyed, and this says why. Absent when nobody was.
    if (result.leftBehind !== undefined && result.leftBehind.length > 0) {
      // The same id-to-name pairing the loss rows use, so a stranded
      // squad reads by the name on its grave rather than by a guess.
      const named = new Map<string, string>([
        ...zip(
          result.mechsDestroyed,
          lostNames(result.mechsDestroyed, "mech", graves, roster),
        ),
        ...zip(
          result.squadsWiped,
          lostNames(result.squadsWiped, "squad", graves, roster),
        ),
      ]);
      panel.appendChild(
        this.section(
          doc,
          "Left behind",
          "left-behind",
          result.leftBehind.map((id) => named.get(id) ?? id),
          "",
          true,
        ),
      );
    }
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

    panel.appendChild(
      this.section(
        doc,
        "Experience",
        "experience",
        this.experienceLines(result, roster),
        "No kills credited.",
        false,
      ),
    );

    // The payout. On a mission that cost nothing it is promoted to the
    // top of the panel; otherwise it stays at the foot, where it has
    // always been (#740).
    const rewards = this.payout(doc, result, lossless);
    if (lossless) {
      // After the mission line, before the four "nothing happened"
      // sections. On a clean debrief those sections are the least
      // informative content on the screen, and the reward was under all
      // of them.
      mission.after(rewards);
    } else {
      panel.appendChild(rewards);
    }
  }

  /**
   * Credits and infestation change.
   *
   * `promoted` gives it size and the winning green — deliberately **not**
   * the alarm's channel. A destroyed mech speaks with a red left border
   * and a danger heading; if good news borrowed the same means, the
   * screen would be saying two opposite things the same way, which the
   * style guide (§12.2) forbids and which is how #736's false alarm
   * managed to read as a catastrophe.
   *
   * @param doc - Owning document.
   * @param result - The mission that just ended.
   * @param promoted - Whether this mission cost the player nothing.
   * @returns The payout block.
   */
  private payout(
    doc: Document,
    result: MissionResult,
    promoted: boolean,
  ): HTMLElement {
    const rewards = doc.createElement("dl");
    rewards.className = promoted
      ? "tut-kv tut-mission-results__payout"
      : "tut-kv";
    rewards.dataset.field = "rewards";
    rewards.dataset.promoted = promoted ? "true" : "false";
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
      // Size says "this matters"; colour says whether it is good news.
      // Credits are a payment and always good. Infestation is not: a
      // mission can cost nothing and still leave the city worse, and a
      // rise shouted in the winning green would be the screen lying
      // pleasantly. So the sign picks the colour.
      const valence =
        field === "credits" || result.infestationDelta <= 0 ? "good" : "bad";
      detail.className = promoted
        ? `tut-mono tut-mission-results__payout-value tut-mission-results__payout-value--${valence}`
        : "tut-mono";
      detail.dataset.field = field;
      detail.textContent = value;
      rewards.append(term, detail);
    }
    return rewards;
  }

  /**
   * One line per surviving unit credited with kills (#1130): what the
   * kills were worth and, when the total crossed a rung, the rank it
   * was promoted to. The roster already holds the new total, so the
   * experience before the mission is read back by subtracting what the
   * mission added — the report's worth and the per-mission credit — and
   * the promotion is judged by the same rule the roster promoted with.
   *
   * ```
   *   Alpha +30 xp · promoted to Corporal
   *   Anvil +60 xp · Sergeant
   * ```
   */
  private experienceLines(
    result: MissionResult,
    roster: RosterState,
  ): DebriefLine[] {
    const { ranks, xpPerMissionSurvived } = this.deps.rosterTuning;
    const line = (
      name: string,
      earned: number,
      xpAfter: number,
    ): DebriefLine => {
      const before = xpAfter - earned - xpPerMissionSurvived;
      const promoted = promotionBetween(before, xpAfter, ranks.ladder);
      const standing = promoted ?? rankOf(xpAfter, ranks.ladder);
      const text = `${name} +${formatWhole(earned)} xp${
        standing === undefined
          ? ""
          : ` · ${promoted === undefined ? "" : "promoted to "}`
      }`;
      return standing === undefined
        ? { text }
        : {
            text,
            rank: {
              name: standing.name,
              index: rankIndexOf(xpAfter, ranks.ladder),
            },
          };
    };
    const squads = result.squadCasualties.flatMap((c) => {
      const squad = roster.squads.find((s) => s.id === c.squadId);
      return squad === undefined || (c.xp ?? 0) <= 0
        ? []
        : [line(squad.name, c.xp ?? 0, squad.xp)];
    });
    const mechs = result.mechDamage.flatMap((d) => {
      const mech = roster.mechs.find((m) => m.id === d.mechId);
      return mech === undefined || (d.xp ?? 0) <= 0
        ? []
        : [line(mech.name, d.xp ?? 0, mech.xp)];
    });
    return [...squads, ...mechs];
  }

  /** A titled list; `prominent` gives the destroyed-mechs block its top billing. */
  private section(
    doc: Document,
    label: string,
    field: string,
    items: readonly (string | DebriefLine)[],
    emptyText: string,
    prominent: boolean,
  ): HTMLElement {
    // Top billing only when there is something to bill. `prominent` says
    // this section *deserves* the alarm when it fires -- losing a mech
    // should be memorable (GDD §5.8) -- but it was applied whatever the
    // content, so a clean mission opened its debrief with a red bar, a
    // red heading and 1.15em type reading "No mechs lost." The loudest
    // thing on the screen said the worst had happened, and then said it
    // had not. Emphasis follows the loss; it does not precede it.
    const alarmed = prominent && items.length > 0;
    const block = doc.createElement("div");
    block.className = alarmed
      ? "tut-mission-results__section tut-mission-results__section--prominent"
      : "tut-mission-results__section";
    block.dataset.field = field;
    block.dataset.count = String(items.length);
    const heading = doc.createElement("div");
    heading.className = alarmed
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
      if (typeof item === "string" || item.rank === undefined) {
        li.textContent = typeof item === "string" ? item : item.text;
      } else {
        // The rank name is its own span so it can carry the popover
        // that says what the rank is worth (#1134).
        li.append(item.text);
        const name = doc.createElement("span");
        name.dataset.role = "rank-name";
        name.textContent = item.rank.name;
        attachRankTooltip(name, item.rank.index, this.deps.rosterTuning.ranks);
        li.appendChild(name);
      }
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

/** Pairs each id with the name at the same index. */
function zip(
  ids: readonly string[],
  names: readonly string[],
): readonly (readonly [string, string])[] {
  return ids.map((id, index) => [id, names[index] ?? id] as const);
}

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
