import type {
  RollEntryKind,
  SquadRollEntry,
} from "../../overworld/model/outcome-chronicle";
import type { RankLadder } from "../../roster/model/rank";
import { rankOf } from "../../roster/service/rank-service";
import { rollRecordText } from "../service/chronicle-text";

// ===========================================
// Constants
// ===========================================

/** Each roll entry's kind as the roll names it. */
const KIND_LABELS: Readonly<Record<RollEntryKind, string>> = {
  mech: "Mech",
  squad: "Squad",
};

/** What the roll says when nobody finished the campaign. */
export const EMPTY_ROLL = "Nobody was left on the roster.";

// ===========================================
// Ordering
// ===========================================

/**
 * The roll's reading order: mechs before squads, as the summary froze
 * them, and within each the most kills first; a tie keeps the roster's
 * order. Returns a new array.
 */
export function rollOrder(
  entries: readonly SquadRollEntry[],
): readonly SquadRollEntry[] {
  const kindRank = (kind: RollEntryKind): number => (kind === "mech" ? 0 : 1);
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        kindRank(a.entry.kind) - kindRank(b.entry.kind) ||
        b.entry.kills - a.entry.kills ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
}

// ===========================================
// SquadRollView
// ===========================================

/**
 * The squad roll on the end screen (campaign arc §13): every mech and
 * squad that finished the campaign, with its rank when a ladder is
 * given, its kills and the missions it came home from.
 *
 * ```
 *   SQUAD
 *   Hammerhead   Mech · Sergeant Major     64 kills · 44 missions
 *   Alpha        Squad · Sergeant Major    23 kills · 31 missions
 * ```
 */
export class SquadRollView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly ladder: RankLadder | undefined;
  private root: HTMLElement | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param ladder - The rank ladder, to name each entry's rank; optional. */
  constructor(ladder?: RankLadder) {
    this.ladder = ladder;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Draws the roll of `entries` at the end of `parent`. */
  mount(parent: HTMLElement, entries: readonly SquadRollEntry[]): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("section");
    root.className = "tut-roll";
    root.dataset.role = "squad-roll";
    const heading = doc.createElement("h2");
    heading.className = "tut-label tut-roll__heading";
    heading.textContent = "Squad";
    root.appendChild(heading);
    if (entries.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "tut-dim";
      empty.textContent = EMPTY_ROLL;
      root.appendChild(empty);
    } else {
      const list = doc.createElement("ol");
      list.className = "tut-roll__list";
      for (const entry of rollOrder(entries)) {
        list.appendChild(this.createEntry(doc, entry));
      }
      root.appendChild(list);
    }
    parent.appendChild(root);
    this.root = root;
  }

  /** Removes the roll. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** One entry: its name, kind and rank, and its record. */
  private createEntry(doc: Document, entry: SquadRollEntry): HTMLElement {
    const item = doc.createElement("li");
    item.className = "tut-roll__entry";
    item.dataset.kind = entry.kind;
    item.dataset.id = entry.id;
    const name = doc.createElement("span");
    name.className = "tut-roll__name";
    name.dataset.field = "roll-name";
    name.textContent = entry.name;
    const role = doc.createElement("span");
    role.className = "tut-dim tut-roll__role";
    role.dataset.field = "roll-role";
    role.textContent = this.roleText(entry);
    const record = doc.createElement("span");
    record.className = "tut-mono tut-roll__record";
    record.dataset.field = "roll-record";
    record.textContent = rollRecordText(entry);
    item.append(name, role, record);
    return item;
  }

  /** `Mech · Sergeant`, or the kind alone without a ladder. */
  private roleText(entry: SquadRollEntry): string {
    const kind = KIND_LABELS[entry.kind];
    const rank =
      this.ladder === undefined ? undefined : rankOf(entry.xp, this.ladder);
    return rank === undefined ? kind : `${kind} · ${rank.name}`;
  }
}
