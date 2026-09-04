import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { iconUrl } from "../data/icon-manifest";
import { formatWhole } from "../service/format";

// ===========================================
// Constants and model
// ===========================================

/** What a field with nothing to show reads as. */
const EMPTY_FIELD = "—";

/** One titled block in a card field: a weapon's name and its numbers. */
interface CardEntry {
  /** Omitted when the unit carries one of whatever this lists. */
  readonly name?: string;
  readonly value: string;
}

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
      ["Attacks", "attacks", "attack"],
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
      value.textContent = EMPTY_FIELD;
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
  update(
    unit: Unit | undefined,
    template: UnitTemplate | undefined,
    attacksLeft?: number,
  ): void {
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
    // Action points alone do not say how many shots are left: a squad's
    // attack costs one, a mech's commits the turn (#533).
    this.set(
      "attacks",
      attacksLeft === undefined ? EMPTY_FIELD : formatWhole(attacksLeft),
    );
    // One block per weapon (#532). A squad or a bug carries one and
    // reads as it always did; a mech lists its arm and back weapons,
    // which is the whole point — they differ in reach.
    this.setEntries(
      "weapon",
      template.weapons.map((weapon) => {
        const p = weapon.profile;
        return {
          name: template.weapons.length > 1 ? weapon.name : undefined,
          value: `range ${formatWhole(p.range)} · acc ${formatWhole(p.accuracy)} · dmg ${formatWhole(p.damage)} · pen ${formatWhole(p.armorPen)}`,
        };
      }),
    );
    this.set("armor", formatWhole(template.armor));
    const pools = template.weapons.filter((w) => w.charges !== undefined);
    const kind = unit.kind === "mech" ? "heat" : "ammo";
    this.setEntries(
      "charges",
      pools.map((weapon) => {
        const capacity = weapon.charges ?? 0;
        const left = unit.charges?.[weapon.id] ?? capacity;
        return {
          name: pools.length > 1 ? weapon.name : undefined,
          value: `${kind} ${formatWhole(left)} / ${formatWhole(capacity)}`,
        };
      }),
    );
    this.set(
      "status",
      unit.status.length === 0 ? EMPTY_FIELD : unit.status.join(", "),
    );
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

  /**
   * Writes one block per entry into a field, each optionally titled.
   *
   * ```
   *   WEAPON   Autocannon              ← name, dim, its own line
   *            range 10 · acc 75 · …
   *                                    ← gap, so the block is one thing
   *            Missile Pod
   *            range 14 · acc 70 · …
   * ```
   *
   * A `\n` between the two would have done if the panel were wide, but
   * each weapon wraps over three lines in it, so six near-identical
   * lines ran together as one paragraph and the `·` separators could not
   * mark the boundary (#641). An entry with no name renders as bare
   * text, which is the single-weapon card that has always shipped.
   */
  private setEntries(field: string, entries: readonly CardEntry[]): void {
    const el = this.fields.get(field);
    if (!el) {
      return;
    }
    if (entries.length === 0) {
      delete el.dataset.entries;
      this.set(field, EMPTY_FIELD);
      return;
    }
    // Rebuild only on a real change: the card is refreshed on every
    // store tick, and replacing these nodes each time would restart any
    // transition on them.
    const key = entries
      .map((e) => `${e.name ?? ""}\u0000${e.value}`)
      .join("\u0001");
    if (el.dataset.entries === key) {
      return;
    }
    el.dataset.entries = key;
    const doc = el.ownerDocument;
    el.replaceChildren(
      ...entries.map((entry) => {
        const block = doc.createElement("div");
        block.className = "tut-card__entry";
        if (entry.name !== undefined) {
          const name = doc.createElement("span");
          name.className = "tut-card__entry-name tut-dim";
          name.textContent = entry.name;
          block.appendChild(name);
        }
        const value = doc.createElement("span");
        value.textContent = entry.value;
        block.appendChild(value);
        return block;
      }),
    );
  }
}
