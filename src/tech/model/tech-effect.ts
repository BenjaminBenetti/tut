import type { PartId } from "../../roster/model/mech-part";
import type { SquadTypeId } from "../../roster/model/squad-type";

// ===========================================
// Effects
// ===========================================

/** The node makes a mech part purchasable in the mech bay (ADR 0011). */
export interface PartTechEffect {
  readonly kind: "part";
  readonly partId: PartId;
}

/**
 * The node sets a campaign flag (ADR 0013 §2.7): a story item, a piece
 * of intel, a capability like the capture net. Plain string so `tech/`
 * never imports the campaign's flag vocabulary; the overworld reads it
 * back as its own `CampaignFlagId`.
 */
export interface FlagTechEffect {
  readonly kind: "flag";
  readonly flag: string;
}

/** The node opens a squad type for hire (campaign arc §10, D8). */
export interface SquadTypeTechEffect {
  readonly kind: "squad-type";
  readonly squadTypeId: SquadTypeId;
}

/** The node grants an upgrade to every infantry squad (campaign arc §10, D8). */
export interface InfantryUpgradeTechEffect {
  readonly kind: "infantry-upgrade";
  readonly upgradeId: string;
}

/**
 * What buying a node does, discriminated on `kind` (ADR 0013 §2.7). It
 * replaces ADR 0011's `unlocks: PartId[]`: a part node carries one part
 * effect per part, and the other kinds of node carry flags, squad types
 * and infantry upgrades. Each consumer reads the kind it owns and
 * ignores the rest, so a new kind of effect is a new arm here and a new
 * reader, never an edit to the old ones.
 *
 * ```
 *   TechEffect
 *   ├── { kind: "part",             partId }        mech bay: part purchasable
 *   ├── { kind: "flag",             flag }          campaign: flag set
 *   ├── { kind: "squad-type",       squadTypeId }   roster: type for hire
 *   └── { kind: "infantry-upgrade", upgradeId }     tactical: squads upgraded
 * ```
 */
export type TechEffect =
  | PartTechEffect
  | FlagTechEffect
  | SquadTypeTechEffect
  | InfantryUpgradeTechEffect;

/** The `kind` tag of a `TechEffect`. */
export type TechEffectKind = TechEffect["kind"];

// ===========================================
// Readers
// ===========================================

/** Anything that carries effects: a `TechNode`, or a fixture shaped like one. */
export interface TechEffectHolder {
  readonly effects: readonly TechEffect[];
}

/**
 * The parts a node makes purchasable, in effect order: what ADR 0011
 * called `unlocks`. Empty for a node with no part effect.
 *
 * @param node - Anything carrying effects, normally a `TechNode`.
 * @returns The part ids of its part effects.
 */
export function partIdsOf(node: TechEffectHolder): readonly PartId[] {
  const ids: PartId[] = [];
  for (const effect of node.effects) {
    if (effect.kind === "part") {
      ids.push(effect.partId);
    }
  }
  return ids;
}
