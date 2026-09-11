import type { UnitKind } from "../../tactical/model/unit";

// ===========================================
// Types
// ===========================================

/**
 * The words one kind of unit uses for the thing its weapons spend.
 *
 * A squad carries rounds and reloads; a mech runs hot and vents. The
 * rules call both `charges`, which is a field name and belongs nowhere
 * on screen — QA found the unit card reading `ammo 0 / 3` beside a
 * refusal saying *"is out of charges; reload or vent first"*, which
 * offered a Rifle Squad an action its own bar does not have (#1062).
 */
export interface ChargeRegister {
  /** The gauge as the unit card labels it — `heat` or `ammo`. */
  readonly gauge: string;
  /** The refill action as its button reads — `Vent` or `Reload`. */
  readonly actionLabel: string;
  /**
   * How "it has none left" reads after the unit's name.
   *
   * A chosen sentence per kind rather than one template with the gauge
   * slotted in: *"is out of heat"* is what the template produces for a
   * mech, and it is not English. The same reason `statusPhrase` is a
   * table — a word that reads correctly in one slot rarely reads
   * correctly in every slot.
   */
  readonly emptyPhrase: string;
}

// ===========================================
// Constants
// ===========================================

/** Squads and bugs carry rounds. */
const MUNITIONS: ChargeRegister = {
  gauge: "ammo",
  actionLabel: "Reload",
  emptyPhrase: "is out of ammo; reload first",
};

/** A mech has no magazine; it sheds heat. */
const HEAT: ChargeRegister = {
  gauge: "heat",
  actionLabel: "Vent",
  emptyPhrase: "must vent before firing again",
};

// ===========================================
// Public Functions
// ===========================================

/**
 * The register a unit's own surfaces use for its charges.
 *
 * One answer for the card, the action bar and the refusal, so the three
 * cannot describe one gauge three ways — which is exactly what they did
 * before this existed.
 *
 * @param kind - What the unit is.
 * @returns The words that unit's surfaces should use.
 */
export function chargeRegisterFor(kind: UnitKind): ChargeRegister {
  return kind === "mech" ? HEAT : MUNITIONS;
}
