import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { LoadoutDescription } from "../../roster/service/loadout-validation-service";
import type { MechUnitTuning } from "../../tactical/model/unit-tuning";
import { mechCombatProfile } from "../../tactical/service/mech-combat-profile";
import { formatWhole } from "./format";
import { weaponProfileText } from "./weapon-profile-text";

// ===========================================
// Types
// ===========================================

/** Whether a change to a stat is good news, bad news or just news. */
export type DeltaTone = "better" | "worse" | "neutral";

/** One stat the hovered part would move, keyed by the sheet's `data-field`. */
export interface StatDelta {
  readonly field: string;
  /** Signed change; never zero. */
  readonly delta: number;
  readonly tone: DeltaTone;
}

/** A weapon slot the hovered part would refit, with the incoming line. */
export interface WeaponPreview {
  /** The weapon slot: `"arm-weapon"` or `"back-weapon"`. */
  readonly slot: string;
  readonly name: string;
  /** The incoming weapon's field line, as the Combat block prints one. */
  readonly text: string;
}

/**
 * What the stat sheet shows while a part is rested on (#1145): every
 * number it would move, the weapon line it would replace, and why the
 * result would not be buildable if it would not.
 */
export interface SheetPreview {
  readonly deltas: readonly StatDelta[];
  readonly weapons: readonly WeaponPreview[];
  readonly warnings: readonly string[];
}

// ===========================================
// Constants
// ===========================================

/**
 * Which way each field is good. The field's move is judged against this
 * so the sheet can colour it: a lighter part is not "better" — weight is
 * a budget, and under it every tonne is free — while less heat always
 * is. Cost is a price, and the sheet does not tell a player what to buy.
 */
const BETTER_WHEN: Readonly<Record<string, "higher" | "lower" | "neither">> = {
  "combat-hp": "higher",
  "combat-ap": "higher",
  "combat-move": "higher",
  "combat-armor": "higher",
  "combat-sight": "higher",
  weight: "neither",
  powerBalance: "higher",
  heat: "lower",
  combatRating: "higher",
  totalCost: "neither",
};

/** Field order, matching the sheet top to bottom. */
const FIELDS = Object.keys(BETTER_WHEN);

// ===========================================
// Public Functions
// ===========================================

/**
 * Differences the draft's sheet against the one a hovered part would
 * produce, in the field's own numbers (#1145): the Combat rows go
 * through `mechCombatProfile` exactly as the sheet prints them, so a
 * `+3` beside Armor is three points of armor on the ground and not
 * three points of plate.
 *
 * ```
 *   current sheet ──┐
 *                   ├──► fieldValues ──► delta per field ──► tone
 *   next sheet    ──┘
 *   next errors  ───────────────────────────────────────► warnings
 * ```
 *
 * With no current sheet (the draft has a hole in it) there is nothing
 * to difference against, and the preview carries only the warnings.
 *
 * @param current - The draft's sheet, or undefined when it has none.
 * @param next - What the hovered part would make of the draft.
 * @param tuning - The mech unit tuning the sheet prints through.
 * @returns The preview.
 */
export function sheetPreview(
  current: MechStatSheet | undefined,
  next: LoadoutDescription,
  tuning: MechUnitTuning,
): SheetPreview {
  const warnings = next.errors.map((error) => error.detail);
  if (current === undefined || next.sheet === undefined) {
    return { deltas: [], weapons: [], warnings };
  }
  const before = fieldValues(current, tuning);
  const after = fieldValues(next.sheet, tuning);
  const deltas: StatDelta[] = [];
  for (const field of FIELDS) {
    const delta = (after[field] ?? 0) - (before[field] ?? 0);
    if (delta !== 0) {
      deltas.push({ field, delta, tone: toneOf(field, delta) });
    }
  }
  return {
    deltas,
    weapons: weaponPreviews(current, next.sheet, tuning),
    warnings,
  };
}

/**
 * A signed whole number with the typographic minus the sheet uses:
 * `+3`, `−2`.
 *
 * @param delta - The change.
 * @returns The text.
 */
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded < 0 ? `−${formatWhole(-rounded)}` : `+${formatWhole(rounded)}`;
}

// ===========================================
// Private Functions
// ===========================================

/** Every previewed field's value for a sheet, by `data-field`. */
function fieldValues(
  sheet: MechStatSheet,
  tuning: MechUnitTuning,
): Readonly<Record<string, number>> {
  const profile = mechCombatProfile(sheet, tuning);
  return {
    "combat-hp": profile.maxHp,
    "combat-ap": profile.maxAp,
    "combat-move": profile.move,
    "combat-armor": profile.armor,
    "combat-sight": profile.sightRange,
    weight: sheet.weight,
    powerBalance: sheet.powerBalance,
    heat: sheet.heat,
    combatRating: sheet.combatRating,
    totalCost: sheet.totalCost,
  };
}

/** Good, bad or neither, for a field moving by `delta`. */
function toneOf(field: string, delta: number): DeltaTone {
  const better = BETTER_WHEN[field] ?? "neither";
  if (better === "neither") {
    return "neutral";
  }
  return delta > 0 === (better === "higher") ? "better" : "worse";
}

/** The weapon slots whose weapon changes, each with the incoming line. */
function weaponPreviews(
  current: MechStatSheet,
  next: MechStatSheet,
  tuning: MechUnitTuning,
): WeaponPreview[] {
  const before = new Map(
    mechCombatProfile(current, tuning).weapons.map((w) => [w.id, w]),
  );
  return mechCombatProfile(next, tuning)
    .weapons.filter((weapon) => {
      const was = before.get(weapon.id);
      if (was === undefined) {
        return true;
      }
      return (
        was.name !== weapon.name ||
        weaponProfileText(was.profile) !== weaponProfileText(weapon.profile)
      );
    })
    .map((weapon) => ({
      slot: weapon.id,
      name: weapon.name,
      text: weaponProfileText(weapon.profile),
    }));
}
