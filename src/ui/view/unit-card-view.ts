import { carryMovePenaltyOf } from "../../tactical/model/carried-specimen";
import type { Unit } from "../../tactical/model/unit";
import { isCivilian, isTrapped } from "../../tactical/model/civilian";
import { isAutonomous } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import type { WeaponId } from "../../tactical/model/unit-weapon";
import type { RankTuning } from "../../roster/model/rank";
import type {
  EquipmentDefinition,
  EquipmentId,
} from "../../tactical/model/equipment";
import { displayWeaponName } from "../../tactical/model/unit-weapon";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { chargeDelayText } from "../service/charge-delay-text";
import { equipmentOf } from "../../tactical/service/equipment-service";
import { footprintSizeOf } from "../../tactical/service/footprint-service";
import { formatWhole } from "../service/format";
import { attachRankTooltip } from "./rank-tooltip-view";
import { weaponProfileText } from "../service/weapon-profile-text";
import { iconGlyph } from "./icon-glyph";
import { chargeRegisterFor } from "../service/charge-register";

// ===========================================
// Constants and model
// ===========================================

/** What a field with nothing to show reads as. */
const EMPTY_FIELD = "—";

/**
 * A row of the card the pointer or keyboard focus can rest on: one of
 * the unit's weapons (#1132) or one of the items it carries (#1134).
 * The owner paints that row's reach on the ground while it rests there.
 */
export type CardHover =
  | { readonly kind: "weapon"; readonly weaponId: WeaponId }
  | { readonly kind: "equipment"; readonly equipmentId: EquipmentId };

/** What the card tells its owner. */
export interface UnitCardHandlers {
  /**
   * The pointer or keyboard focus came to rest on a weapon's or an
   * item's row, or left it (`undefined`).
   */
  readonly onRowHover?: (hover: CardHover | undefined) => void;
}

/** What the card needs injected; everything optional, a bare card still reads. */
export interface UnitCardOptions {
  /** The ladder and its rates, so the rank badge can say what it is worth (#1134). */
  readonly rankTuning?: RankTuning;
}

/** One titled block in a card field: a weapon's name and its numbers. */
interface CardEntry {
  /**
   * What the block stands for, when resting on it means something: a
   * weapon's or an item's id, so the row can announce itself (#1132,
   * #1134). Absent for a block that is only text.
   */
  readonly id?: string;
  /** What kind of thing `id` names; a weapon when absent. */
  readonly kind?: CardHover["kind"];
  /** Omitted when the unit carries one of whatever this lists. */
  readonly name?: string;
  readonly value: string;
  /**
   * The weapon's own heat or ammo, on a dim line under its numbers.
   *
   * It used to be a `Charges` row of its own, which repeated every
   * weapon's name to say which pool was which -- so a two-weapon mech
   * printed "Autocannon" and "Missile Pod" twice each and the card grew
   * past the bottom of the screen (#652). A pool belongs to the weapon
   * it feeds, so it goes in the weapon's block and the second list is
   * gone.
   */
  readonly charges?: string;
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
 *   ┌ ALPHA ─────────── TDF · squad · Corporal ┐
 *   │ HP ▮▮▮▮▮▮▮░░░ 14 / 20      AP 1 / 2     │
 *   │ Weapon  range 8 · acc 65 · dmg 3 · pen 0 │
 *   │ Armor 0            overwatch             │
 *   └──────────────────────────────────────────┘
 * ```
 *
 * A deployed turret (#1138) reads its battery instead of an action
 * budget: it takes no orders, so the AP, Move and Attacks rows go and a
 * Battery row ("3 turns") takes their place.
 *
 * A squad carrying a netted specimen (#1179) gains a Carrying row
 * ("live lurker"), and its Move reads what it can walk with it:
 * "2 (−1 carrying)" for a squad of move 3.
 *
 * A civilian group (campaign arc §6.4) keeps its HP, AP and Move but
 * drops the Attacks, Weapon and Equipment rows, and its status reads
 * "trapped" until a squad or mech frees it.
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
  private readonly handlers: UnitCardHandlers;
  private readonly options: UnitCardOptions;
  /** The rank index the badge's popover was last attached for. */
  private rankAttached: number | undefined;
  /** The weapon row the pointer or focus rests on, if any (#1132). */
  private hovered: CardHover | undefined;
  /** Each stat row's term and value, so an enemy's card can drop the rows that are not its business (#1134). */
  private readonly rows = new Map<string, readonly HTMLElement[]>();
  /** The field whose row is rested on, so another field's rewrite leaves it alone. */
  private hoveredField: string | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Whom to tell about a weapon row being rested on; none by default.
   * @param options - The rank tuning for the badge's popover; none by default.
   */
  constructor(handlers: UnitCardHandlers = {}, options: UnitCardOptions = {}) {
    this.handlers = handlers;
    this.options = options;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the card with an optional header toolbar; call `update` to fill it. */
  mount(parent: HTMLElement, controls?: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "unit-card";
    section.className = "tut-panel tut-hud__card";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Unit";
    if (controls) title.append(controls);

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
    // The rank beside the side, only for a unit that holds one (#1130):
    // a bug has no stripes, and a badge reading nothing says nothing.
    const rank = doc.createElement("span");
    rank.className = "tut-badge";
    rank.dataset.field = "unit-rank";
    rank.hidden = true;

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
      ["Battery", "battery", "advance"],
      ["Move", "move", "move"],
      ["Attacks", "attacks", "attack"],
      ["Weapon", "weapon", "attack"],
      ["Equipment", "equipment", "ability"],
      ["Carrying", "carrying", "bug"],
      ["Armor", "armor", "armor"],
      ["Heat", "heat", "warning"],
      ["Status", "status", "overwatch"],
    ] as const) {
      const term = doc.createElement("dt");
      term.className = "tut-label tut-row";
      // The glyph carries the row at a glance; the word stays for anyone who
      // does not know the glyph yet (#495).
      const mark = iconGlyph(doc, icon);
      term.append(mark, doc.createTextNode(label));
      const value = doc.createElement("dd");
      value.className = "tut-mono";
      value.dataset.field = field;
      value.textContent = EMPTY_FIELD;
      if (field === "weapon" || field === "equipment") {
        // A block row: the term on its own line and the entries under
        // it across the whole card, so a weapon's numbers fit on one or
        // two lines instead of four in the value column (#1134).
        term.classList.add("tut-kv__block");
        value.classList.add("tut-kv__block");
      }
      grid.append(term, value);
      this.fields.set(field, value);
      this.rows.set(field, [term, value]);
    }

    body.append(name, side, rank, meter, grid);
    section.append(title, empty, body);
    parent.appendChild(section);
    this.fields.set("unit-name", name);
    this.fields.set("unit-side", side);
    this.fields.set("unit-rank", rank);
    this.root = section;
    this.empty = empty;
    this.body = body;
    this.meter = fill;
  }

  /**
   * Shows `unit` with its template, or the placeholder when either is
   * missing.
   *
   * `name` is the unit's identity -- "Alpha", the name the player gave
   * this squad -- and the template's name is its type: "Rifle Squad",
   * which every squad in the force shares. The card takes the identity
   * when the caller can supply one (#1040), because a card that says
   * "Rifle Squad" cannot tell the player which of the three they have
   * selected.
   */
  update(
    unit: Unit | undefined,
    template: UnitTemplate | undefined,
    attacksLeft?: number,
    name?: string,
  ): void {
    if (!this.body || !this.empty) {
      return;
    }
    if (!unit || !template) {
      // A hidden row cannot be left by the pointer, so the card says so.
      this.hover(undefined);
      // An empty card reads nobody, enemy or not.
      delete this.root?.dataset.inspectingEnemy;
      this.body.hidden = true;
      this.empty.hidden = false;
      return;
    }
    // An enemy's card (#1134): the player clicked a bug to read it. It
    // has no rank, no equipment and no attacks of the player's to count,
    // so those rows go; its footprint is worth a word when it is a block.
    const enemy = unit.team !== "tdf";
    const size = footprintSizeOf(template);
    if (this.root) {
      if (enemy) {
        this.root.dataset.inspectingEnemy = "true";
      } else {
        delete this.root.dataset.inspectingEnemy;
      }
    }
    // A civilian group's card (campaign arc §6.4): it carries nothing
    // and never shoots, so the rows about fighting go.
    const civilian = isCivilian(unit);
    for (const field of ["attacks", "equipment"]) {
      for (const el of this.rows.get(field) ?? []) {
        el.hidden = enemy || civilian;
      }
    }
    for (const el of this.rows.get("weapon") ?? []) {
      el.hidden = civilian;
    }
    // A turret's card (#1138): no action budget to read, a battery to
    // read instead. The rows swap rather than both showing, so the card
    // never says "AP 0 / 0" about a thing that was never going to act.
    const autonomous = isAutonomous(unit);
    for (const field of ["ap", "move", "attacks"]) {
      for (const el of this.rows.get(field) ?? []) {
        el.hidden = enemy || autonomous || (civilian && field === "attacks");
      }
    }
    // A garrison turret (#1155) runs on mains: the row stays, reading
    // so, rather than a turret card with nothing where its power goes.
    for (const el of this.rows.get("battery") ?? []) {
      el.hidden = !autonomous && unit.turnsLeft === undefined;
    }
    this.set(
      "battery",
      unit.turnsLeft === undefined
        ? autonomous
          ? "mains"
          : EMPTY_FIELD
        : `${formatWhole(unit.turnsLeft)} ${unit.turnsLeft === 1 ? "turn" : "turns"}`,
    );
    this.set("unit-name", name ?? template.name);
    this.set(
      "unit-side",
      `${unit.team} · ${unit.kind}${size > 1 ? ` · ${String(size)}×${String(size)}` : ""}`,
    );
    // What it can walk now: a netted specimen weighs a tile per action
    // (#1179), and the card says so rather than print a number the
    // move preview will not honour.
    const penalty = carryMovePenaltyOf(unit);
    this.set(
      "move",
      penalty === 0
        ? formatWhole(template.move)
        : `${formatWhole(Math.max(0, template.move - penalty))} (−${formatWhole(penalty)} carrying)`,
    );
    for (const el of this.rows.get("carrying") ?? []) {
      el.hidden = unit.carrying === undefined;
    }
    this.set(
      "carrying",
      unit.carrying === undefined
        ? EMPTY_FIELD
        : `live ${unit.carrying.species}`,
    );
    this.set("unit-rank", template.rank?.name ?? "");
    const rankBadge = this.fields.get("unit-rank");
    if (rankBadge) {
      rankBadge.hidden = template.rank === undefined;
      this.attachRank(rankBadge, template.rank?.index);
    }
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
    // One source for this word, shared with the action bar and the
    // refusal text, which used to choose it separately (#1062).
    const kind = chargeRegisterFor(unit.kind).gauge;
    this.setEntries(
      "weapon",
      template.weapons.map((weapon) => {
        const capacity = weapon.charges;
        const left = unit.charges?.[weapon.id] ?? capacity ?? 0;
        return {
          id: weapon.id,
          name: displayWeaponName(template.weapons, weapon),
          // The same line the mech bay prints for the weapon (#1132).
          value: weaponProfileText(weapon.profile),
          charges:
            capacity === undefined
              ? undefined
              : `${kind} ${formatWhole(left)} / ${formatWhole(capacity)}`,
        };
      }),
    );
    // What the unit carries besides its weapon (#1132), each with its
    // uses left; a bug or a mech carries nothing and shows a dash.
    this.setEntries(
      "equipment",
      equipmentOf(template, unit, SHIPPED_EQUIPMENT).map((carried) => ({
        id: carried.definition.id,
        kind: "equipment" as const,
        name: carried.definition.name,
        value: equipmentSummary(carried.definition),
        charges: `uses ${formatWhole(carried.usesLeft)} / ${formatWhole(carried.definition.uses)}`,
      })),
    );
    this.set("armor", formatWhole(template.armor));
    for (const el of this.rows.get("heat") ?? []) {
      el.hidden = !template.systems;
    }
    this.set(
      "heat",
      template.systems
        ? `${String(unit.heat ?? 0)}/${String(template.systems.heatCapacity)} · cool ${String(template.systems.cooling)}/turn · idle +${String(template.systems.idleHeat)}`
        : EMPTY_FIELD,
    );
    this.set(
      "status",
      [
        ...(isTrapped(unit) ? ["trapped"] : []),
        ...unit.status,
        ...(unit.braced ? ["braced"] : []),
        ...(template.systems?.jumpRange
          ? [`jump ${String(template.systems.jumpRange)}`]
          : []),
        ...(template.systems?.equipment?.includes("mech-coolant")
          ? [
              `coolant ${String(unit.equipment?.["mech-coolant"] ?? template.systems.coolantUses ?? 0)}/${String(template.systems.coolantUses ?? 0)}`,
            ]
          : []),
        ...(template.systems?.equipment?.includes("mech-designator")
          ? ["target designator"]
          : []),
        ...(unit.designatedBy ? ["designated"] : []),
        ...(template.systems?.ablativeHits
          ? [
              `ablative ${String(Math.max(0, template.systems.ablativeHits - (unit.ablativeSpent ?? 0)))}/${String(template.systems.ablativeHits)}`,
            ]
          : []),
      ].join(", ") || EMPTY_FIELD,
    );
    this.meter?.style.setProperty(
      "--value",
      `${String(unit.maxHp === 0 ? 0 : (100 * unit.hp) / unit.maxHp)}%`,
    );
    this.body.hidden = false;
    this.empty.hidden = true;
  }

  /** The row the pointer or focus rests on, if any (#1132, #1134). */
  hoveredRow(): CardHover | undefined {
    return this.hovered;
  }

  /** Removes the card. */
  unmount(): void {
    this.hover(undefined);
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

  /**
   * Gives the badge its popover for `index` (#1134). Listeners are
   * added once and the popover reads the index they were attached
   * with, so a new rank on the same badge replaces the badge's text
   * and re-attaches; the same rank leaves it alone.
   */
  private attachRank(badge: HTMLElement, index: number | undefined): void {
    const tuning = this.options.rankTuning;
    if (tuning === undefined || index === undefined) {
      return;
    }
    if (index !== this.rankAttached) {
      this.rankAttached = index;
      attachRankTooltip(badge, index, tuning);
    }
  }

  /**
   * Records where the pointer or focus rests and tells the owner once
   * per change. `field` names the block the row belongs to, so that
   * block's rewrite — and only that block's — can let go of it: the
   * equipment block is rewritten on every refresh too, and a mech with
   * nothing to list must not drop the weapon row the pointer is on.
   */
  private hover(row: CardHover | undefined, field?: string): void {
    if (sameHover(row, this.hovered)) {
      return;
    }
    this.hovered = row;
    this.hoveredField = row === undefined ? undefined : field;
    this.handlers.onRowHover?.(row);
  }

  /** Lets go of the rested row when it belongs to `field`, whose rows are being replaced. */
  private releaseHoverIn(field: string): void {
    if (this.hoveredField === field) {
      this.hover(undefined);
    }
  }

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
   *            heat 4 / 4              ← its own pool, dim (#652)
   *                                    ← gap, so the block is one thing
   *            Missile Pod
   *            range 14 · acc 70 · …
   *            heat 4 / 4
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
      this.releaseHoverIn(field);
      this.set(field, EMPTY_FIELD);
      return;
    }
    // Rebuild only on a real change: the card is refreshed on every
    // store tick, and replacing these nodes each time would restart any
    // transition on them.
    const key = entries
      .map(
        (e) =>
          `${e.kind ?? ""}:${e.id ?? ""}\u0000${e.name ?? ""}\u0000${e.value}\u0000${e.charges ?? ""}`,
      )
      .join("\u0001");
    if (el.dataset.entries === key) {
      return;
    }
    el.dataset.entries = key;
    // The rows are about to be replaced, and a replaced row never fires
    // its leave; whatever rested on one is resting on nothing now.
    this.releaseHoverIn(field);
    const doc = el.ownerDocument;
    el.replaceChildren(
      ...entries.map((entry) => {
        const block = doc.createElement("div");
        block.className = "tut-card__entry";
        if (entry.id !== undefined) {
          // A row that can be rested on (#1132): by pointer, and by
          // keyboard, since a preview that only the mouse can reach is
          // a preview half the players cannot have. It says so with a
          // pointer cursor and a lift on hover (#1134).
          const row: CardHover =
            entry.kind === "equipment"
              ? { kind: "equipment", equipmentId: entry.id }
              : { kind: "weapon", weaponId: entry.id };
          block.classList.add("tut-card__entry--hoverable");
          if (row.kind === "equipment") {
            block.dataset.role = "equipment-row";
            block.dataset.equipmentId = row.equipmentId;
          } else {
            block.dataset.role = "weapon-row";
            block.dataset.weaponId = row.weaponId;
          }
          block.tabIndex = 0;
          for (const type of ["mouseenter", "focus"]) {
            block.addEventListener(type, () => {
              this.hover(row, field);
            });
          }
          for (const type of ["mouseleave", "blur"]) {
            block.addEventListener(type, () => {
              if (sameHover(this.hovered, row)) {
                this.hover(undefined);
              }
            });
          }
        }
        // The name and its pool share a line ("Grenade · uses 2 / 2"):
        // a card with two weapons or two items has to fit its column
        // without scrolling (#1134), and the pool is short.
        if (entry.name !== undefined || entry.charges !== undefined) {
          const head = doc.createElement("span");
          head.className = "tut-card__entry-head";
          if (entry.name !== undefined) {
            const name = doc.createElement("span");
            name.className = "tut-card__entry-name tut-dim";
            name.textContent = entry.name;
            head.appendChild(name);
          }
          if (entry.charges !== undefined) {
            if (entry.name !== undefined) {
              const dot = doc.createElement("span");
              dot.className = "tut-dim";
              dot.textContent = " · ";
              head.appendChild(dot);
            }
            const charges = doc.createElement("span");
            charges.className = "tut-card__entry-charges tut-dim";
            charges.dataset.role = "charges";
            charges.textContent = entry.charges;
            head.appendChild(charges);
          }
          block.appendChild(head);
        }
        const value = doc.createElement("span");
        value.textContent = entry.value;
        block.appendChild(value);
        return block;
      }),
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * The numbers an item is judged by (#1132): where it may go and, for a
 * grenade or a charge, what it does there, on the weapon line's
 * pattern; for a medkit or a repair kit what it gives, how wide, and to
 * what — `heal 10 · blast 2 · organic` (#1138).
 */
function equipmentSummary(definition: EquipmentDefinition): string {
  const parts = [`range ${formatWhole(definition.range)}`];
  const heal = definition.heal;
  if (heal !== undefined) {
    parts.push(
      `heal ${formatWhole(heal.amount)}`,
      `blast ${formatWhole(heal.radius)}`,
      heal.target,
    );
  }
  const p = definition.profile;
  if (p !== undefined) {
    if (definition.kind === "blast") {
      parts.push(`acc ${formatWhole(p.accuracy)}`);
    }
    parts.push(
      `dmg ${formatWhole(p.damage)}`,
      `pen ${formatWhole(p.armorPen)}`,
    );
    if (p.aoe !== undefined) {
      parts.push(`blast ${formatWhole(p.aoe.radius)}`);
    }
    if ((p.demoForce ?? 0) > 0) {
      parts.push(`demo ${formatWhole(p.demoForce ?? 0)}`);
    }
  }
  if (definition.delayTurns !== undefined) {
    parts.push(chargeDelayText(definition.delayTurns));
  }
  return parts.join(" · ");
}

/** True when both name the same row, or both name none. */
function sameHover(
  a: CardHover | undefined,
  b: CardHover | undefined,
): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  if (a.kind !== b.kind) {
    return false;
  }
  return a.kind === "weapon"
    ? a.weaponId === (b as { weaponId: WeaponId }).weaponId
    : a.equipmentId === (b as { equipmentId: EquipmentId }).equipmentId;
}
