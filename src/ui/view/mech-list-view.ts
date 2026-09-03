import type { Mech, MechId } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { RosterState } from "../../roster/model/roster-state";
import type { RosterTuning } from "../../roster/model/roster-tuning";
import { formatCredits, formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the mech list reports back to its owner. */
export interface MechListViewHandlers {
  /** The player pressed Repair on a mech. */
  readonly onRepair: (mechId: MechId) => void;
  /** The player confirmed a new name for a mech. */
  readonly onRename: (mechId: MechId, name: string) => void;
}

/** What the list needs to render one frame. */
export interface MechListModel {
  readonly roster: RosterState;
  readonly credits: number;
}

/** What the list needs injected to label and price mechs. */
export interface MechListViewDeps {
  readonly parts: PartCatalogue;
  readonly tuning: RosterTuning;
}

// ===========================================
// MechListView
// ===========================================

/**
 * The roster's mech panel: one row per mech with its loadout summary
 * (chassis and weapons by catalogue name), a damage meter, kills and xp,
 * a Repair button priced at `repairCostPerPoint × damage`, and an
 * inline rename field. Buttons the treasury cannot cover are disabled;
 * the rows are rebuilt on every `update`.
 *
 * ```
 *   ┌ Mechs ──────────────────────────────────────────────────────────┐
 *   │ [name____][Rename] │ Vanguard · Autocannon / Missile pod │ ▮▮▯ 40 │ … │ [Repair ¢400] │
 *   └──────────────────────────────────────────────────────────────────┘
 * ```
 */
export class MechListView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: MechListViewHandlers;
  private readonly deps: MechListViewDeps;
  private root: HTMLElement | undefined;
  private rows: HTMLTableSectionElement | undefined;
  private empty: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Callbacks for repair and rename.
   * @param deps - Part catalogue for names and tuning for repair prices.
   */
  constructor(handlers: MechListViewHandlers, deps: MechListViewDeps) {
    this.handlers = handlers;
    this.deps = deps;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "mech-list";
    panel.className = "tut-panel tut-roster__panel";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Mechs";

    const table = doc.createElement("table");
    table.className = "tut-table";
    const head = doc.createElement("thead");
    const headRow = doc.createElement("tr");
    for (const label of ["Name", "Loadout", "Damage", "Kills", "XP", ""]) {
      const th = doc.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    const rows = doc.createElement("tbody");
    table.append(head, rows);

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-mechs";
    empty.textContent = "No mechs. Build one in the mech bay.";
    empty.hidden = true;

    panel.append(title, table, empty);
    parent.appendChild(panel);
    this.root = panel;
    this.rows = rows;
    this.empty = empty;
  }

  /** Rebuilds the rows from `model`. */
  update(model: MechListModel): void {
    if (!this.rows || !this.empty) {
      return;
    }
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    const doc = this.rows.ownerDocument;
    this.rows.replaceChildren(
      ...model.roster.mechs.map((mech) =>
        this.createRow(doc, mech, model.credits),
      ),
    );
    this.empty.hidden = model.roster.mechs.length > 0;
  }

  /** Removes the panel and every listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.rows = undefined;
    this.empty = undefined;
  }

  // ===========================================
  // Rows
  // ===========================================

  /** One mech row with rename field, damage meter and Repair button. */
  private createRow(
    doc: Document,
    mech: Mech,
    credits: number,
  ): HTMLTableRowElement {
    const row = doc.createElement("tr");
    row.dataset.mechId = mech.id;

    const nameCell = doc.createElement("td");
    nameCell.dataset.field = "name";
    const nameInput = doc.createElement("input");
    nameInput.type = "text";
    nameInput.className = "tut-input";
    nameInput.dataset.field = "rename";
    nameInput.value = mech.name;
    nameInput.maxLength = 24;
    const rename = doc.createElement("button");
    rename.type = "button";
    rename.className = "tut-btn";
    rename.dataset.action = "rename";
    rename.textContent = "Rename";
    rename.disabled = true;
    this.listen(nameInput, "input", () => {
      const next = nameInput.value.trim();
      rename.disabled = next === "" || next === mech.name;
    });
    this.listen(rename, "click", () => {
      this.handlers.onRename(mech.id, nameInput.value.trim());
    });
    nameCell.append(nameInput, rename);

    const loadout = doc.createElement("td");
    loadout.dataset.field = "loadout";
    loadout.textContent = this.summarise(mech.loadout);

    const damage = doc.createElement("td");
    damage.dataset.field = "damage";
    damage.append(
      this.createMeter(doc, mech.damage),
      doc.createTextNode(` ${formatWhole(mech.damage)}`),
    );

    const kills = doc.createElement("td");
    kills.dataset.field = "kills";
    kills.textContent = formatWhole(mech.kills);
    const xp = doc.createElement("td");
    xp.dataset.field = "xp";
    xp.textContent = formatWhole(mech.xp);

    const actions = doc.createElement("td");
    const cost = this.deps.tuning.repairCostPerPoint * mech.damage;
    const repair = doc.createElement("button");
    repair.type = "button";
    repair.className = "tut-btn";
    repair.dataset.action = "repair";
    repair.textContent =
      mech.damage === 0 ? "No damage" : `Repair ${formatCredits(cost)}`;
    repair.disabled = mech.damage === 0 || cost > credits;
    repair.title =
      mech.damage > 0 && cost > credits ? "Not enough credits" : "";
    this.listen(repair, "click", () => {
      this.handlers.onRepair(mech.id);
    });
    actions.appendChild(repair);

    row.append(nameCell, loadout, damage, kills, xp, actions);
    return row;
  }

  /** Chassis and the two weapons by catalogue name, falling back to ids. */
  private summarise(loadout: MechLoadout): string {
    const name = (id: string): string =>
      this.deps.parts.getPart(id)?.name ?? id;
    return `${name(loadout.chassisId)} · ${name(loadout.armWeaponId)} / ${name(loadout.backWeaponId)}`;
  }

  /** A damage meter whose fill and tone follow the damage fraction. */
  private createMeter(doc: Document, damage: number): HTMLElement {
    const meter = doc.createElement("span");
    const fraction = Math.min(1, Math.max(0, damage / MECH_MAX_DAMAGE));
    const tone = fraction >= 0.6 ? "danger" : "ok";
    meter.className = `tut-meter tut-meter--${tone}`;
    meter.dataset.tone = tone;
    const fill = doc.createElement("span");
    fill.className = "tut-meter__fill";
    fill.style.width = `${Math.round(fraction * 100)}%`;
    meter.appendChild(fill);
    return meter;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Attaches a listener and remembers how to remove it. */
  private listen(
    target: HTMLElement,
    event: "click" | "input",
    handler: () => void,
  ): void {
    target.addEventListener(event, handler);
    this.disposers.push(() => {
      target.removeEventListener(event, handler);
    });
  }
}
