import type { InfantryUpgradeDefinition } from "../../roster/model/infantry-upgrade";
import type { RankLadder, RankTuning } from "../../roster/model/rank";
import type { RosterState } from "../../roster/model/roster-state";
import type { Squad } from "../../roster/model/squad";
import type { SquadType, SquadTypeId } from "../../roster/model/squad-type";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import { formatCredits, formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";
import { rankCell } from "./rank-cell";

// ===========================================
// Types
// ===========================================

/** What the squad list reports back to its owner. */
export interface SquadListViewHandlers {
  /** The player pressed Hire with a type and name. */
  readonly onHire: (typeId: SquadTypeId, name: string) => void;
  /** The player pressed Reinforce; `soldiers` is everything the squad is missing. */
  readonly onReinforce: (squadId: string, soldiers: number) => void;
}

/** What the list needs to render one frame. */
export interface SquadListModel {
  readonly roster: RosterState;
  readonly credits: number;
  /**
   * Squad types the tech tree has not opened yet (campaign arc §10.3),
   * each mapped to the name of the node that opens it. Absent means
   * every type may be hired.
   */
  readonly lockedTypes?: ReadonlyMap<SquadTypeId, string>;
  /**
   * The campaign's infantry upgrades, in application order, for the
   * research line under the title. Absent means none.
   */
  readonly upgrades?: readonly InfantryUpgradeDefinition[];
}

// ===========================================
// SquadListView
// ===========================================

/**
 * The roster's infantry panel: one row per squad with type, rank (#1130),
 * strength, kills and xp and a Reinforce button priced at the type's per-soldier
 * rate for every missing soldier, plus a hire form whose type picker
 * shows each type's cost. Buttons the treasury cannot cover are
 * disabled; the rows are rebuilt on every `update` since the roster is
 * small. A line under the title names the infantry upgrades the tech
 * tree has researched for every squad, and a type the tree has not
 * opened yet stays in the picker, disabled, naming the node that opens
 * it (campaign arc §10.3).
 *
 * ```
 *   ┌ Squads ─────────────────────────────────────────────┐
 *   │ Infantry research: Squad armour I · Frag grenades    │
 *   │ name  │ type   │ rank │ strength │ kills │ xp │ [Reinforce ¢160] │
 *   │ …                                                    │
 *   │ Hire: [type ▾ (¢500)] [name____] [Hire ¢500]          │
 *   │         Heavy Weapons Squad · ¢900 · research Heavy Weapons Infantry (disabled) │
 *   └──────────────────────────────────────────────────────┘
 * ```
 */
export class SquadListView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: SquadListViewHandlers;
  private readonly squadTypes: SquadTypeCatalogue;
  private readonly ranks: RankLadder;
  /** The ladder with its rates, for the rank popover (#1134); absent means no popover. */
  private readonly rankTuning: RankTuning | undefined;
  private root: HTMLElement | undefined;
  private rows: HTMLTableSectionElement | undefined;
  private typePicker: HTMLSelectElement | undefined;
  private nameInput: HTMLInputElement | undefined;
  private hireButton: HTMLButtonElement | undefined;
  private hireDescription: HTMLElement | undefined;
  private research: HTMLElement | undefined;
  private credits = 0;
  private lockedTypes: ReadonlyMap<SquadTypeId, string> = new Map();
  private readonly disposers: (() => void)[] = [];
  private squads: readonly Squad[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Callbacks for hire and reinforce.
   * @param squadTypes - Catalogue the picker and prices are read from.
   * @param ranks - The ladder each squad's experience is read against.
   * @param rankTuning - The ladder with its rates, for the rank popover (#1134); optional.
   */
  constructor(
    handlers: SquadListViewHandlers,
    squadTypes: SquadTypeCatalogue,
    ranks: RankLadder,
    rankTuning?: RankTuning,
  ) {
    this.handlers = handlers;
    this.squadTypes = squadTypes;
    this.ranks = ranks;
    this.rankTuning = rankTuning;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "squad-list";
    panel.className = "tut-panel tut-roster__panel";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Squads";

    const table = doc.createElement("table");
    table.className = "tut-table";
    const head = doc.createElement("thead");
    const headRow = doc.createElement("tr");
    for (const label of [
      "Name",
      "Type",
      "Rank",
      "Strength",
      "Kills",
      "XP",
      "",
    ]) {
      const th = doc.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    const rows = doc.createElement("tbody");
    table.append(head, rows);

    const form = this.createHireForm(doc);

    const research = doc.createElement("p");
    research.className = "tut-dim";
    research.dataset.field = "infantry-upgrades";
    this.research = research;

    panel.append(title, research, table, form.root);
    const description = doc.createElement("p");
    description.className = "tut-dim";
    description.id = "hire-description";
    form.picker.setAttribute("aria-describedby", description.id);
    panel.appendChild(description);
    this.hireDescription = description;
    parent.appendChild(panel);

    this.root = panel;
    this.rows = rows;
    this.typePicker = form.picker;
    this.nameInput = form.name;
    this.hireButton = form.button;
  }

  /** Rebuilds the rows and re-prices the hire form from `model`. */
  update(model: SquadListModel): void {
    this.squads = model.roster.squads;
    if (!this.rows) {
      return;
    }
    this.credits = model.credits;
    this.lockedTypes = model.lockedTypes ?? new Map();
    const doc = this.rows.ownerDocument;
    this.rows.replaceChildren(
      ...model.roster.squads.map((squad) => this.createRow(doc, squad)),
    );
    this.renderResearch(model.upgrades ?? []);
    this.refreshPickerLocks();
    this.refreshHireForm();
  }

  /** Removes the panel and every listener added since `mount`. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.rows = undefined;
    this.typePicker = undefined;
    this.hireDescription = undefined;
    this.research = undefined;
    this.nameInput = undefined;
    this.hireButton = undefined;
  }

  // ===========================================
  // Rows
  // ===========================================

  /** One squad row with its Reinforce button. */
  private createRow(doc: Document, squad: Squad): HTMLTableRowElement {
    const row = doc.createElement("tr");
    row.dataset.squadId = squad.id;
    const type = this.squadTypes.getSquadType(squad.typeId);
    const missing = squad.maxStrength - squad.strength;
    const cost = (type?.reinforceCostPerSoldier ?? 0) * missing;

    // Same kind glyph the deployment picker and the unit card use, so a
    // squad reads as a squad wherever it appears (#595).
    //
    // The flex row is a span *inside* the cell, not the cell itself:
    // `display: flex` on a `td` takes it out of the table's own layout
    // and its bottom border stops lining up with the rest of the row.
    const nameCell = doc.createElement("td");
    nameCell.dataset.field = "name";
    const nameRow = doc.createElement("span");
    nameRow.className = "tut-row";
    nameRow.append(iconGlyph(doc, "squad"), doc.createTextNode(squad.name));
    nameCell.appendChild(nameRow);

    row.append(
      nameCell,
      this.cell(doc, type?.name ?? squad.typeId, "type"),
      rankCell(doc, squad.xp, this.ranks, this.rankTuning),
      this.cell(
        doc,
        `${formatWhole(squad.strength)} / ${formatWhole(squad.maxStrength)}`,
        "strength",
      ),
      this.cell(doc, formatWhole(squad.kills), "kills"),
      this.cell(doc, formatWhole(squad.xp), "xp"),
    );

    const actions = doc.createElement("td");
    const reinforce = doc.createElement("button");
    reinforce.type = "button";
    reinforce.className = "tut-btn";
    reinforce.dataset.action = "reinforce";
    reinforce.textContent =
      missing === 0 ? "Full strength" : `Reinforce ${formatCredits(cost)}`;
    reinforce.disabled =
      missing === 0 || type === undefined || cost > this.credits;
    reinforce.title =
      missing > 0 && cost > this.credits ? "Not enough credits" : "";
    this.listen(reinforce, () => {
      this.handlers.onReinforce(squad.id, missing);
    });
    actions.appendChild(reinforce);
    row.appendChild(actions);
    return row;
  }

  /** A data cell carrying `data-field` for tests. */
  private cell(
    doc: Document,
    text: string,
    field: string,
  ): HTMLTableCellElement {
    const td = doc.createElement("td");
    td.dataset.field = field;
    td.textContent = text;
    return td;
  }

  // ===========================================
  // Research
  // ===========================================

  /**
   * The line naming the campaign's infantry upgrades (campaign arc
   * §10.3), each with what it does on hover, or saying there are none.
   */
  private renderResearch(upgrades: readonly InfantryUpgradeDefinition[]): void {
    if (!this.research) {
      return;
    }
    const doc = this.research.ownerDocument;
    const label = doc.createTextNode("Infantry research: ");
    if (upgrades.length === 0) {
      this.research.replaceChildren(
        label,
        doc.createTextNode("none yet (the tech tree's Infantry branch)"),
      );
      return;
    }
    const parts: Node[] = [label];
    upgrades.forEach((upgrade, index) => {
      if (index > 0) {
        parts.push(doc.createTextNode(" · "));
      }
      const name = doc.createElement("span");
      name.dataset.upgradeId = upgrade.id;
      name.title = upgrade.summary;
      name.textContent = upgrade.name;
      parts.push(name);
    });
    this.research.replaceChildren(...parts);
  }

  // ===========================================
  // Hire form
  // ===========================================

  /** The type picker, name field and Hire button. */
  private createHireForm(doc: Document): {
    root: HTMLElement;
    picker: HTMLSelectElement;
    name: HTMLInputElement;
    button: HTMLButtonElement;
  } {
    const form = doc.createElement("div");
    form.className = "tut-row tut-roster__hire";

    const picker = doc.createElement("select");
    picker.className = "tut-select";
    picker.dataset.field = "hire-type";
    for (const type of this.squadTypes.listSquadTypes()) {
      const option = doc.createElement("option");
      option.value = type.id;
      option.textContent = optionLabel(type, undefined);
      picker.appendChild(option);
    }

    const name = doc.createElement("input");
    name.type = "text";
    name.className = "tut-input";
    name.placeholder = "Squad name";
    name.dataset.field = "hire-name";
    name.maxLength = 24;

    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tut-btn tut-btn--primary";
    button.dataset.action = "hire";
    button.textContent = "Hire";

    this.listen(
      picker,
      () => {
        this.refreshHireForm();
      },
      "change",
    );
    this.listen(
      name,
      () => {
        this.refreshHireForm();
      },
      "input",
    );
    this.listen(button, () => {
      const type = this.selectedType();
      if (!type || !this.nameInput) {
        return;
      }
      const chosen = this.nameInput.value.trim();
      this.handlers.onHire(
        type.id,
        chosen === "" ? nextSquadName(type, this.squads) : chosen,
      );
      this.nameInput.value = "";
      this.refreshHireForm();
    });

    form.append(picker, name, button);
    return { root: form, picker, name, button };
  }

  /** The catalogue entry the picker currently shows. */
  private selectedType(): SquadType | undefined {
    return this.typePicker
      ? this.squadTypes.getSquadType(this.typePicker.value)
      : undefined;
  }

  /**
   * Locks and unlocks the picker's options to match the tech tree: a
   * locked type stays listed, disabled, naming the node that opens it.
   * If the selection is a type that has just been locked, the picker
   * moves to the first type that is not.
   */
  private refreshPickerLocks(): void {
    if (!this.typePicker) {
      return;
    }
    for (const option of Array.from(this.typePicker.options)) {
      const type = this.squadTypes.getSquadType(option.value);
      if (type === undefined) {
        continue;
      }
      const node = this.lockedTypes.get(type.id);
      option.disabled = node !== undefined;
      option.textContent = optionLabel(type, node);
      if (node === undefined) {
        delete option.dataset.locked;
      } else {
        option.dataset.locked = "true";
      }
    }
    const selected = this.typePicker.selectedOptions[0];
    if (selected?.disabled === true) {
      const open = Array.from(this.typePicker.options).find(
        (option) => !option.disabled,
      );
      if (open) {
        this.typePicker.value = open.value;
      }
    }
  }

  /** Re-labels and enables the Hire button for the selected type, its lock and the balance. */
  private refreshHireForm(): void {
    if (!this.hireButton) {
      return;
    }
    const type = this.selectedType();
    if (this.hireDescription)
      this.hireDescription.textContent = type?.description ?? "";
    if (!type) {
      this.hireButton.textContent = "Hire";
      this.hireButton.disabled = true;
      return;
    }
    this.hireButton.textContent = `Hire ${formatCredits(type.hireCost)}`;
    const node = this.lockedTypes.get(type.id);
    if (node !== undefined) {
      this.hireButton.disabled = true;
      this.hireButton.title = `Research ${node} first`;
      return;
    }
    const affordable = type.hireCost <= this.credits;
    this.hireButton.disabled = !affordable;
    this.hireButton.title = affordable ? "" : "Not enough credits";
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Attaches a listener and remembers how to remove it. */
  private listen(
    target: HTMLElement,
    handler: () => void,
    event: "click" | "change" | "input" = "click",
  ): void {
    target.addEventListener(event, handler);
    this.disposers.push(() => {
      target.removeEventListener(event, handler);
    });
  }
}

// ===========================================
// Naming
// ===========================================

/**
 * A picker option's text: the type and its price, and for a type the
 * tech tree has not opened, the node to research.
 *
 * ```
 *   Rifle Squad · ¢500
 *   Heavy Weapons Squad · ¢900 · research Heavy Weapons Infantry
 * ```
 */
function optionLabel(type: SquadType, lockedBy: string | undefined): string {
  const base = `${type.name} · ${formatCredits(type.hireCost)}`;
  return lockedBy === undefined ? base : `${base} · research ${lockedBy}`;
}

/**
 * A default name for a hired squad when the player leaves the field
 * blank: the type name numbered per type across the roster (#294), so
 * the third rifle squad hired is "Rifle Squad 3" and never
 * "Rifle Squad squad".
 */
function nextSquadName(type: SquadType, squads: readonly Squad[]): string {
  const ofType = squads.filter((squad) => squad.typeId === type.id).length;
  return `${type.name} ${String(ofType + 1)}`;
}
