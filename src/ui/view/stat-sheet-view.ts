import type { Result } from "../../core/model/result";
import type { LoadoutError } from "../../roster/model/loadout-error";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { MechCombatProfile } from "../../tactical/model/mech-combat-profile";
import type { MechUnitTuning } from "../../tactical/model/unit-tuning";
import { mechCombatProfile } from "../../tactical/service/mech-combat-profile";
import { formatCredits, formatWhole } from "../service/format";
import type { SheetPreview } from "../service/sheet-preview";
import { formatDelta } from "../service/sheet-preview";
import { weaponProfileText } from "../service/weapon-profile-text";

// ===========================================
// Constants
// ===========================================

/**
 * The sheet fields the Build block prints: what constrains the build,
 * not what the mech does with it. Numeric only: the sheet also carries
 * `weapons` (#532), which the Combat block prints per weapon.
 */
type BuildKey = {
  [K in keyof MechStatSheet]-?: MechStatSheet[K] extends number ? K : never;
}[keyof MechStatSheet];

/**
 * Build rows in display order with their labels. The sheet's raw
 * `armor`, `mobility`, `accuracy` and `firepower` are deliberately not
 * here (#1132): they are part sums the field never shows — a mech with
 * "50 armor" takes hits at 15 — and printing them under the same words
 * as the field's numbers is what the Executive Director caught. What
 * they become is in the Combat block.
 */
const BUILD_ROWS: readonly [BuildKey, string][] = [
  ["weight", "Weight"],
  ["powerBalance", "Power balance"],
  ["heat", "Heat load"],
  ["combatRating", "Rating"],
  ["totalCost", "Total cost"],
];

/** Combat rows in display order: the labels the tactical unit card uses. */
const COMBAT_ROWS: readonly [keyof CombatFields, string][] = [
  ["combat-hp", "HP"],
  ["combat-ap", "AP"],
  ["combat-move", "Move"],
  ["combat-armor", "Armor"],
  ["combat-sight", "Sight"],
];

/** The scalar Combat fields, keyed by their `data-field`. */
interface CombatFields {
  readonly "combat-hp": number;
  readonly "combat-ap": number;
  readonly "combat-move": number;
  readonly "combat-armor": number;
  readonly "combat-sight": number;
}

/** What a field shows while there is no sheet. */
const EMPTY = "—";

// ===========================================
// StatSheetView
// ===========================================

/**
 * The mech bay's right half: the draft's field numbers and its build
 * numbers, or the list of reasons the draft is not buildable.
 *
 * ```
 *   ┌ Stat sheet ─────────────── [Buildable] ┐
 *   │ COMBAT                                 │   the mech as the field
 *   │   HP 70   AP 2   Move 8   Armor 6      │   sees it (#1132): the
 *   │   Sight 14                             │   same derivation the
 *   │   Weapon  Autocannon                   │   unit factory freezes
 *   │           range 10 · acc 75 · dmg 18 … │   into the template
 *   │           Missile Pod                  │
 *   │           range 14 · acc 70 · dmg 22 … │
 *   │ BUILD                                  │   what constrains the
 *   │   Weight 60  Power balance 0  Heat −1  │   build
 *   │   Rating 113  Total cost ¢2,850        │
 *   └────────────────────────────────────────┘
 * ```
 *
 * The Combat block is `mechCombatProfile` over the validated sheet —
 * one source of truth with the tactical unit factory, so the bay can
 * never describe a mech the field contradicts. Values show dashes while
 * the draft is invalid, since there is no sheet to derive from; the
 * errors also render beside their slots on the stage.
 *
 * While a palette part is rested on, `preview` puts a signed delta
 * beside every value it would move (#1145) — `Armor 6 +3` — the
 * incoming weapon's line under the weapon it replaces, and a warning
 * when the swap would leave the build unbuildable.
 */
export class StatSheetView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly tuning: MechUnitTuning;
  private root: HTMLElement | undefined;
  private fields = new Map<string, HTMLElement>();
  private deltas = new Map<string, HTMLElement>();
  private weapons: HTMLElement | undefined;
  private verdict: HTMLElement | undefined;
  private errors: HTMLElement | undefined;
  private warning: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /**
   * @param tuning - The mech slice of the unit tuning, which turns a
   *   sheet into field numbers; the same object the mission uses.
   */
  constructor(tuning: MechUnitTuning) {
    this.tuning = tuning;
  }

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("aside");
    panel.id = "stat-sheet";
    panel.className = "tut-panel tut-mech-bay__sheet";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Stat sheet";

    const verdict = doc.createElement("span");
    verdict.className = "tut-badge";
    verdict.dataset.field = "verdict";

    const combatTitle = doc.createElement("div");
    combatTitle.className = "tut-label";
    combatTitle.dataset.role = "combat-title";
    combatTitle.textContent = "Combat";
    const combat = doc.createElement("dl");
    combat.className = "tut-kv";
    combat.dataset.role = "combat";
    for (const [key, label] of COMBAT_ROWS) {
      combat.append(...this.row(doc, key, label));
    }
    const weaponsTerm = doc.createElement("dt");
    weaponsTerm.className = "tut-label";
    weaponsTerm.textContent = "Weapon";
    const weapons = doc.createElement("dd");
    weapons.className = "tut-mono";
    weapons.dataset.field = "combat-weapons";
    weapons.textContent = EMPTY;
    combat.append(weaponsTerm, weapons);
    combat.append(...this.row(doc, "systems", "Systems"));
    combat.append(...this.row(doc, "cooling", "Thermal"));

    const buildTitle = doc.createElement("div");
    buildTitle.className = "tut-label";
    buildTitle.dataset.role = "build-title";
    buildTitle.textContent = "Build";
    const build = doc.createElement("dl");
    build.className = "tut-kv";
    build.dataset.role = "build";
    for (const [key, label] of BUILD_ROWS) {
      build.append(...this.row(doc, key, label));
    }

    const errors = doc.createElement("ul");
    errors.className = "tut-list tut-mech-bay__errors";
    errors.dataset.role = "errors";
    errors.hidden = true;

    const warning = doc.createElement("p");
    warning.className = "tut-mech-bay__preview-warning";
    warning.dataset.role = "preview-warning";
    warning.hidden = true;

    panel.append(
      title,
      verdict,
      combatTitle,
      combat,
      buildTitle,
      build,
      warning,
      errors,
    );
    parent.appendChild(panel);
    this.root = panel;
    this.weapons = weapons;
    this.verdict = verdict;
    this.errors = errors;
    this.warning = warning;
  }

  /** Shows the field and build numbers on success, or dashes plus every error on failure. */
  update(result: Result<MechStatSheet, LoadoutError[]>): void {
    if (!this.verdict || !this.errors || !this.weapons) {
      return;
    }
    if (result.ok) {
      const sheet = result.value;
      const profile = mechCombatProfile(sheet, this.tuning);
      const fields = combatFields(profile);
      for (const [key] of COMBAT_ROWS) {
        this.set(key, formatWhole(fields[key]));
      }
      this.setWeapons(profile);
      const systems = profile.systems;
      this.set(
        "cooling",
        systems
          ? `capacity ${String(systems.heatCapacity)} · cool ${String(systems.cooling)}/turn · idle +${String(systems.idleHeat)} · move +${String(systems.movementHeat)}/AP`
          : EMPTY,
      );
      this.set(
        "systems",
        systems
          ? [
              ...(systems.jumpRange
                ? [
                    `jump ${String(systems.jumpRange)} · height ${String(systems.jumpHeight)} · heat +${String(systems.jumpHeat)}`,
                  ]
                : []),
              ...(systems.allTerrain ? ["all-terrain"] : []),
              ...(systems.braceAccuracy
                ? [`braced aim +${String(systems.braceAccuracy)}`]
                : []),
              ...(systems.stationaryAccuracy
                ? [`stationary aim +${String(systems.stationaryAccuracy)}`]
                : []),
              ...(systems.energyHeatFactor && systems.energyHeatFactor < 1
                ? [
                    `energy heat −${String(Math.round(100 * (1 - systems.energyHeatFactor)))}%`,
                  ]
                : []),
              ...(systems.ablativeHits
                ? [
                    `ablative ${String(systems.ablativeHits)} hits × ${String(systems.ablativeAbsorption)}`,
                  ]
                : []),
              ...(systems.equipment ?? []).map(
                (id) =>
                  ({
                    "mech-recon": "3 recon beacons",
                    "mech-repair": "2 field repairs",
                    "mech-coolant": `${String(systems.coolantUses ?? 0)} coolant doses`,
                    "mech-designator": "target designation",
                  })[id] ?? id,
              ),
            ].join(" · ") || EMPTY
          : EMPTY,
      );
      for (const [key] of BUILD_ROWS) {
        this.set(
          key,
          key === "totalCost"
            ? formatCredits(sheet[key])
            : formatWhole(sheet[key]),
        );
      }
      this.verdict.textContent = "Buildable";
      this.verdict.className = "tut-badge tut-badge--ok";
      this.verdict.dataset.tone = "ok";
      this.errors.replaceChildren();
      this.errors.hidden = true;
      return;
    }
    for (const el of this.fields.values()) {
      el.textContent = EMPTY;
    }
    this.weapons.replaceChildren();
    this.weapons.textContent = EMPTY;
    this.verdict.textContent = `Not buildable · ${formatWhole(result.error.length)} issue${result.error.length === 1 ? "" : "s"}`;
    this.verdict.className = "tut-badge tut-badge--danger";
    this.verdict.dataset.tone = "danger";
    const doc = this.errors.ownerDocument;
    this.errors.replaceChildren(
      ...result.error.map((error) => {
        const item = doc.createElement("li");
        item.dataset.code = error.code;
        if (error.slot) {
          item.dataset.slot = error.slot;
        }
        item.textContent = error.detail;
        return item;
      }),
    );
    this.errors.hidden = false;
  }

  /**
   * Shows what a hovered part would change, or clears the last preview
   * when given nothing (#1145). Every delta lands beside its value; a
   * value the part leaves alone shows no delta at all, so the eye goes
   * straight to what moves.
   */
  preview(preview: SheetPreview | undefined): void {
    for (const el of this.deltas.values()) {
      el.textContent = "";
      el.hidden = true;
      delete el.dataset.tone;
    }
    this.root
      ?.querySelectorAll('[data-role="combat-weapon-preview"]')
      .forEach((el) => {
        el.remove();
      });
    if (this.warning) {
      this.warning.textContent = "";
      this.warning.hidden = true;
    }
    if (this.root) {
      this.root.dataset.previewing = preview === undefined ? "false" : "true";
    }
    if (preview === undefined) {
      return;
    }
    for (const delta of preview.deltas) {
      const el = this.deltas.get(delta.field);
      if (!el) {
        continue;
      }
      el.textContent = formatDelta(delta.delta);
      el.dataset.tone = delta.tone;
      el.hidden = false;
    }
    for (const weapon of preview.weapons) {
      const block = this.root?.querySelector<HTMLElement>(
        `[data-role="combat-weapon"][data-weapon="${weapon.slot}"]`,
      );
      const doc = this.root?.ownerDocument;
      if (!doc || !this.weapons) {
        continue;
      }
      const line = doc.createElement("div");
      line.className = "tut-mech-bay__weapon-preview";
      line.dataset.role = "combat-weapon-preview";
      line.dataset.weapon = weapon.slot;
      line.textContent = `→ ${weapon.name} · ${weapon.text}`;
      if (block) {
        block.appendChild(line);
      } else {
        this.weapons.appendChild(line);
      }
    }
    if (this.warning && preview.warnings.length > 0) {
      this.warning.textContent = preview.warnings.join(" ");
      this.warning.hidden = false;
    }
  }

  /** Removes the panel. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.fields = new Map<string, HTMLElement>();
    this.deltas = new Map<string, HTMLElement>();
    this.weapons = undefined;
    this.verdict = undefined;
    this.errors = undefined;
    this.warning = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /**
   * One term/value pair for a grid, registered under `key`, with the
   * delta cell the preview writes into beside the value.
   */
  private row(doc: Document, key: string, label: string): HTMLElement[] {
    const term = doc.createElement("dt");
    term.className = "tut-label";
    term.textContent = label;
    const cell = doc.createElement("dd");
    cell.className = "tut-data tut-mech-bay__value";
    const value = doc.createElement("span");
    value.dataset.field = key;
    value.textContent = EMPTY;
    const delta = doc.createElement("span");
    delta.className = "tut-mech-bay__delta";
    delta.dataset.role = "delta";
    delta.dataset.field = key;
    delta.hidden = true;
    cell.append(value, delta);
    this.fields.set(key, value);
    this.deltas.set(key, delta);
    return [term, cell];
  }

  /** Writes a field's text. */
  private set(key: string, text: string): void {
    const el = this.fields.get(key);
    if (el) {
      el.textContent = text;
    }
  }

  /**
   * One block per weapon, name over the line the unit card prints
   * (#532, #1132), so the bay and the field read the same way.
   */
  private setWeapons(profile: MechCombatProfile): void {
    if (!this.weapons) {
      return;
    }
    const doc = this.weapons.ownerDocument;
    this.weapons.textContent = "";
    this.weapons.replaceChildren(
      ...profile.weapons.map((weapon) => {
        const block = doc.createElement("div");
        block.className = "tut-card__entry";
        block.dataset.role = "combat-weapon";
        block.dataset.weapon = weapon.id;
        const name = doc.createElement("div");
        name.className = "tut-card__entry-name tut-dim";
        name.textContent = weapon.name;
        const value = doc.createElement("div");
        value.textContent = weaponProfileText(weapon.profile);
        block.append(name, value);
        return block;
      }),
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/** The scalar Combat fields of a profile, keyed by `data-field`. */
function combatFields(profile: MechCombatProfile): CombatFields {
  return {
    "combat-hp": profile.maxHp,
    "combat-ap": profile.maxAp,
    "combat-move": profile.move,
    "combat-armor": profile.armor,
    "combat-sight": profile.sightRange,
  };
}
