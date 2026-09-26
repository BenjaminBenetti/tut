import type { GameOutcome } from "../../overworld/model/game-outcome";
import { MAX_THREAT } from "../../overworld/model/threat";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** One figure on the end screen. */
export interface OutcomeNumber {
  readonly label: string;
  /** `data-field` of the value, which tests and e2e read. */
  readonly field: string;
  readonly value: string;
  /** A dim line under the value, with its own `data-field`. */
  readonly note?: { readonly field: string; readonly text: string };
  /** Tints the value: `danger` for a figure that ended the campaign. */
  readonly tone?: "danger";
}

// ===========================================
// Figures
// ===========================================

/**
 * The end screen's final numbers for `outcome`, in reading order. The
 * mission count is the campaign's own (`missionsPlayed`), so it agrees
 * with the chronicle's mission spans; an outcome saved before it was
 * frozen falls back to the ledger's count.
 *
 * ```
 *   Day reached   Missions        Final threat
 *   Cities saved  Cities lost     Cities infested
 * ```
 */
export function outcomeNumbers(outcome: GameOutcome): readonly OutcomeNumber[] {
  const { summary } = outcome;
  const of = (n: number): string =>
    `${formatWhole(n)} / ${formatWhole(summary.citiesTotal)}`;
  const missions = summary.missionsPlayed ?? summary.missionsRun;
  return [
    { label: "Day reached", field: "day", value: formatWhole(outcome.day) },
    {
      label: "Missions",
      field: "missions-run",
      value: formatWhole(missions),
      ...(summary.missionsWon === undefined
        ? {}
        : {
            note: {
              field: "missions-won",
              text: `${formatWhole(summary.missionsWon)} won`,
            },
          }),
    },
    {
      label: "Final threat",
      field: "final-threat",
      value: formatWhole(summary.finalThreat),
      ...(summary.finalThreat >= MAX_THREAT ? { tone: "danger" as const } : {}),
    },
    {
      label: "Cities saved",
      field: "cities-saved",
      value: of(Math.max(0, summary.citiesTotal - summary.citiesLost)),
    },
    {
      label: "Cities lost",
      field: "cities-lost",
      value: of(summary.citiesLost),
    },
    {
      label: "Cities infested",
      field: "cities-infested",
      value: of(summary.citiesInfested),
    },
  ];
}

// ===========================================
// OutcomeNumbersView
// ===========================================

/**
 * The final numbers as a grid of tiles, label over value, three to a
 * row. Each value carries its `data-field` (`day`, `missions-run`,
 * `final-threat`, `cities-saved`, `cities-lost`, `cities-infested`).
 */
export class OutcomeNumbersView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Draws the numbers of `outcome` at the end of `parent`. */
  mount(parent: HTMLElement, outcome: GameOutcome): void {
    const doc = parent.ownerDocument;
    const grid = doc.createElement("dl");
    grid.className = "tut-game-over__numbers";
    grid.dataset.role = "outcome-numbers";
    for (const figure of outcomeNumbers(outcome)) {
      grid.appendChild(this.createTile(doc, figure));
    }
    parent.appendChild(grid);
    this.root = grid;
  }

  /** Removes the grid. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** One tile: the label, the value and its note. */
  private createTile(doc: Document, figure: OutcomeNumber): HTMLElement {
    const tile = doc.createElement("div");
    tile.className = "tut-game-over__number";
    const term = doc.createElement("dt");
    term.className = "tut-label";
    term.textContent = figure.label;
    const value = doc.createElement("dd");
    value.className = "tut-mono tut-game-over__value";
    value.dataset.field = figure.field;
    if (figure.tone !== undefined) {
      value.dataset.tone = figure.tone;
    }
    value.textContent = figure.value;
    tile.append(term, value);
    if (figure.note !== undefined) {
      const note = doc.createElement("dd");
      note.className = "tut-dim tut-game-over__note";
      note.dataset.field = figure.note.field;
      note.textContent = figure.note.text;
      tile.appendChild(note);
    }
    return tile;
  }
}
