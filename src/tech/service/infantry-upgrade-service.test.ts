import { describe, expect, it } from "vitest";

import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import { INFANTRY_UPGRADE_IDS } from "../../roster/model/infantry-upgrade";
import { TECH_FAMILIES } from "../data/tech-families";
import { TECH_NODES } from "../data/tech-tree";
import { infantryUpgradeIdsOf } from "../model/tech-effect";
import { StaticTechCatalogue } from "../repository/static-tech-catalogue";
import {
  infantryUpgradesFor,
  unlockedInfantryUpgradeIds,
} from "./infantry-upgrade-service";

const TECH = new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES));

describe("infantryUpgradeIdsOf", () => {
  it("reads only the infantry upgrade effects, in order", () => {
    expect(
      infantryUpgradeIdsOf({
        effects: [
          { kind: "flag", flag: "capture-net" },
          { kind: "infantry-upgrade", upgradeId: "capture-net" },
          { kind: "part", partId: "legs-jumper" },
          { kind: "infantry-upgrade", upgradeId: "frag-grenades" },
        ],
      }),
    ).toEqual(["capture-net", "frag-grenades"]);
  });
});

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

  it("grants no capture net before Pheromone Analysis is bought (#1179)", () => {
    expect([
      ...unlockedInfantryUpgradeIds(TECH, {
        unlocked: ["tech.jump-jets", "tech.frag-grenades", "tech.gone"],
      }),
    ]).not.toContain("capture-net");
  });

  it("grants the capture net once Pheromone Analysis is bought (#1179)", () => {
    expect([
      ...unlockedInfantryUpgradeIds(TECH, {
        unlocked: ["tech.jump-jets", "tech.pheromone-analysis"],
      }),
    ]).toEqual(["capture-net"]);
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

  it("gives the capture net, the one upgrade that adds an item, from Intel I after the family's own (#1179)", () => {
    const active = infantryUpgradesFor(TECH, INFANTRY_UPGRADES, {
      unlocked: ["tech.pheromone-analysis", "tech.frag-grenades"],
    });
    expect(active).toEqual([
      INFANTRY_UPGRADES["frag-grenades"],
      INFANTRY_UPGRADES["capture-net"],
    ]);
    expect(active[1]?.equipmentAdds).toEqual(["capture-net"]);
  });

  it("gives every upgrade once the whole tree is researched", () => {
    const all = infantryUpgradesFor(TECH, INFANTRY_UPGRADES, {
      unlocked: TECH_NODES.map((node) => node.id),
    });
    expect(all.map((u) => u.id)).toEqual(INFANTRY_UPGRADE_IDS);
  });
});
