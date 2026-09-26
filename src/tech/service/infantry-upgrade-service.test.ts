import { describe, expect, it } from "vitest";

import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import { INFANTRY_UPGRADE_IDS } from "../../roster/model/infantry-upgrade";
import { TECH_FAMILIES } from "../data/tech-families";
import { TECH_NODES } from "../data/tech-tree";
import { StaticTechCatalogue } from "../repository/static-tech-catalogue";
import {
  infantryUpgradesFor,
  unlockedInfantryUpgradeIds,
} from "./infantry-upgrade-service";

const TECH = new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES));

describe("unlockedInfantryUpgradeIds", () => {
  it("unions the upgrades of every unlocked node and ignores an unknown or part node", () => {
    expect([...unlockedInfantryUpgradeIds(TECH, { unlocked: [] })]).toEqual([]);
    const ids = unlockedInfantryUpgradeIds(TECH, {
      unlocked: [
        "tech.frag-grenades",
        "tech.jump-jets",
        "tech.heavy-weapons",
        "tech.gone",
        "tech.squad-armour-1",
      ],
    });
    expect([...ids].sort()).toEqual(["frag-grenades", "squad-armour-1"]);
  });
});

describe("infantryUpgradesFor (campaign arc §10.3)", () => {
  it("is nothing for a fresh campaign", () => {
    expect(
      infantryUpgradesFor(TECH, INFANTRY_UPGRADES, { unlocked: [] }),
    ).toEqual([]);
  });

  it("gives the definitions of what was researched, in application order", () => {
    const active = infantryUpgradesFor(TECH, INFANTRY_UPGRADES, {
      unlocked: [
        "tech.incendiary-grenades",
        "tech.frag-grenades",
        "tech.squad-armour-1",
      ],
    });
    expect(active).toEqual([
      INFANTRY_UPGRADES["squad-armour-1"],
      INFANTRY_UPGRADES["frag-grenades"],
      INFANTRY_UPGRADES["incendiary-grenades"],
    ]);
  });

  it("gives every upgrade once the whole tree is researched", () => {
    const all = infantryUpgradesFor(TECH, INFANTRY_UPGRADES, {
      unlocked: TECH_NODES.map((node) => node.id),
    });
    expect(all.map((u) => u.id)).toEqual(INFANTRY_UPGRADE_IDS);
  });
});
