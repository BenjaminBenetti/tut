import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { formatWhole } from "../service/format";

// ===========================================
// UnitCardView
// ===========================================

/**
 * The selected unit's card (GDD §6.2): name and side, hit points with a
 * meter, action points, the template's weapon and armor, and any status
 * tags. Every number is copied from the state; nothing is derived here.
 *
 * ```
 *   ┌ RIFLE SQUAD ──────────────── TDF · squad ┐
 *   │ HP ▮▮▮▮▮▮▮░░░ 14 / 20      AP 1 / 2     │
 *   │ Weapon  range 8 · acc 65 · dmg 3 · pen 0 │
 *   │ Armor 0            overwatch             │
 *   └──────────────────────────────────────────┘
 * ```
 */
export class UnitCardView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private body: HTMLElement | undefined;
  private fields = new Map<string, HTMLElement>();
  private meter: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the card under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "unit-card";
    section.className = "tut-panel tut-hud__card";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Unit";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-unit";
    empty.textContent = "Select a unit.";

    const body = doc.createElement("div");
    body.className = "tut-stack";
    body.hidden = true;

    const name = doc.createElement("div");
    name.className = "tut-city__name";
    name.dataset.field = "unit-name";
    const side = doc.createElement("span");
    side.className = "tut-badge";
    side.dataset.field = "unit-side";

    const meter = doc.createElement("div");
    meter.className = "tut-meter tut-meter--ok";
    const fill = doc.createElement("div");
    fill.className = "tut-meter__fill";
    meter.appendChild(fill);

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    for (const [label, field] of [
      ["HP", "hp"],
      ["AP", "ap"],
      ["Weapon", "weapon"],
      ["Armor", "armor"],
      ["Charges", "charges"],
      ["Status", "status"],
    ] as const) {
      const term = doc.createElement("dt");
      term.className = "tut-label";
      term.textContent = label;
      const value = doc.createElement("dd");
      value.className = "tut-mono";
      value.dataset.field = field;
      value.textContent = "—";
      grid.append(term, value);
      this.fields.set(field, value);
    }

    body.append(name, side, meter, grid);
    section.append(title, empty, body);
    parent.appendChild(section);
    this.fields.set("unit-name", name);
    this.fields.set("unit-side", side);
    this.root = section;
    this.empty = empty;
    this.body = body;
    this.meter = fill;
  }

  /** Shows `unit` with its template, or the placeholder when either is missing. */
  update(unit: Unit | undefined, template: UnitTemplate | undefined): void {
    if (!this.body || !this.empty) {
      return;
    }
    if (!unit || !template) {
      this.body.hidden = true;
      this.empty.hidden = false;
      return;
    }
    this.set("unit-name", template.name);
    this.set("unit-side", `${unit.team} · ${unit.kind}`);
    this.set("hp", `${formatWhole(unit.hp)} / ${formatWhole(unit.maxHp)}`);
    this.set("ap", `${formatWhole(unit.ap)} / ${formatWhole(unit.maxAp)}`);
    const w = template.weapon;
    this.set(
      "weapon",
      `range ${formatWhole(w.range)} · acc ${formatWhole(w.accuracy)} · dmg ${formatWhole(w.damage)} · pen ${formatWhole(w.armorPen)}`,
    );
    this.set("armor", formatWhole(template.armor));
    this.set(
      "charges",
      template.charges === undefined || unit.charges === undefined
        ? "—"
        : `${unit.kind === "mech" ? "heat" : "ammo"} ${formatWhole(unit.charges)} / ${formatWhole(template.charges)}`,
    );
    this.set("status", unit.status.length === 0 ? "—" : unit.status.join(", "));
    this.meter?.style.setProperty(
      "--value",
      `${String(unit.maxHp === 0 ? 0 : (100 * unit.hp) / unit.maxHp)}%`,
    );
    this.body.hidden = false;
    this.empty.hidden = true;
  }

  /** Removes the card. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.empty = undefined;
    this.body = undefined;
    this.meter = undefined;
    this.fields = new Map();
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Writes a field's text only when it changed. */
  private set(field: string, text: string): void {
    const el = this.fields.get(field);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }
}
