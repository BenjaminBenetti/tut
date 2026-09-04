import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { iconUrl } from "../data/icon-manifest";
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
    for (const [label, field, icon] of [
      ["HP", "hp", "hp"],
      ["AP", "ap", "ap"],
      ["Weapon", "weapon", "attack"],
      ["Armor", "armor", "armor"],
      ["Charges", "charges", "ammo"],
      ["Status", "status", "overwatch"],
    ] as const) {
      const term = doc.createElement("dt");
      term.className = "tut-label tut-row";
      // The glyph carries the row at a glance; the word stays for anyone who
      // does not know the glyph yet (#495).
      const mark = doc.createElement("span");
      mark.className = "tut-icon tut-icon--sm";
      mark.style.setProperty("--icon", iconUrl(icon));
      term.append(mark, doc.createTextNode(label));
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
    // One line per weapon (#532). A squad or a bug carries one and reads
    // as it always did; a mech lists its arm and back weapons, which is
    // the whole point — they differ in reach.
    this.set(
      "weapon",
      template.weapons
        .map((weapon) => {
          const p = weapon.profile;
          const label = template.weapons.length > 1 ? `${weapon.name}: ` : "";
          return `${label}range ${formatWhole(p.range)} · acc ${formatWhole(p.accuracy)} · dmg ${formatWhole(p.damage)} · pen ${formatWhole(p.armorPen)}`;
        })
        .join("\n"),
    );
    this.set("armor", formatWhole(template.armor));
    const pools = template.weapons.filter((w) => w.charges !== undefined);
    this.set(
      "charges",
      pools.length === 0
        ? "—"
        : pools
            .map((weapon) => {
              const capacity = weapon.charges ?? 0;
              const left = unit.charges?.[weapon.id] ?? capacity;
              const label = pools.length > 1 ? `${weapon.name} ` : "";
              const kind = unit.kind === "mech" ? "heat" : "ammo";
              return `${label}${kind} ${formatWhole(left)} / ${formatWhole(capacity)}`;
            })
            .join("\n"),
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
