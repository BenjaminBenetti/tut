import type { NemesisLore } from "../model/nemesis-lore";

// ===========================================
// Nemesis lore (campaign arc §6.8, §8)
// ===========================================

/**
 * The names and scars of the campaign's named enemies. Short and
 * weathered, the register the arc sets with "Old Scald": what a TDF
 * squad would call a thing it has met before.
 *
 * - 18 Broodmother names and 16 alpha names, so a campaign rarely meets
 *   two of one name; a name is drawn with the offer's own stream.
 * - Scars are noun or participle phrases, with no pronoun, so one line
 *   reads for a Broodmother and an alpha alike: the briefing prints
 *   "Old Scald, scarred: burned along the flank. Level 2".
 * - Each wound has three or four lines; the record picks one by the
 *   enemy's name and escapes, so a second escape from the same wound
 *   usually reads differently, and nothing is drawn.
 */
export const NEMESIS_LORE: NemesisLore = {
  broodmotherNames: [
    "Old Scald",
    "Mother Grist",
    "Blackwomb",
    "The Widow",
    "Nettlequeen",
    "Ashbelly",
    "Old Gorge",
    "Rotmother",
    "Sister Silt",
    "Hollowcrown",
    "Mother Brine",
    "The Tallow Queen",
    "Old Harrow",
    "Cinderbrood",
    "Mother Moult",
    "Grey Vesper",
    "Sallow Anne",
    "Old Spindle",
  ],
  alphaNames: [
    "Grinder",
    "Hook",
    "Rattle",
    "Old Knuckle",
    "Splitjaw",
    "Gristle",
    "Scrape",
    "Burr",
    "Crook",
    "Stitch",
    "Mauler",
    "Halfmoon",
    "Gnash",
    "Rook",
    "Brindle",
    "Sawtooth",
  ],
  scars: {
    gunfire: [
      "rifle rounds still lodged in the carapace",
      "a leg lost to the squad's guns",
      "a mandible shattered by a lucky shot",
      "a carapace pocked by rifle fire",
    ],
    mech: [
      "a plate caved in by a mech's cannon",
      "a mech round clean through the flank",
      "a limb torn away by a mech's barrage",
    ],
    turret: [
      "a flank raked by turret fire",
      "a carapace chewed open by an autocannon",
      "a hind leg dragging from a turret burst",
    ],
    blast: [
      "shrapnel buried under the plates",
      "a leg torn off by a blast",
      "a carapace split by a grenade",
    ],
    fire: [
      "burned along the flank",
      "a carapace blackened by fire",
      "an eye seared shut by the flames",
    ],
    unmarked: [
      "no wound, only a long memory",
      "not a scratch, and wary of the drop ship",
      "unmarked; it learned the squad's ways",
    ],
  },
};
