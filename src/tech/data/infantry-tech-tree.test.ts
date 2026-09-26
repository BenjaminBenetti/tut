import { describe, expect, it } from "vitest";

import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { INFANTRY_UPGRADE_IDS } from "../../roster/model/infantry-upgrade";
import { infantryUpgradeIdsOf, squadTypeIdsOf } from "../model/tech-effect";
import { INFANTRY_TECH_NODES } from "./infantry-tech-tree";
import { TECH_NODES, TIER_2_COST, TIER_3_COST } from "./tech-tree";

const byId = (id: string) => INFANTRY_TECH_NODES.find((node) => node.id === id);

describe("INFANTRY_TECH_NODES (campaign arc §10.3)", () => {
  it("is six infantry nodes of the infantry family, all in the shipped tree", () => {
    expect(INFANTRY_TECH_NODES).toHaveLength(6);
    for (const node of INFANTRY_TECH_NODES) {
      expect(node.kind, node.id).toBe("infantry");
      expect(node.family, node.id).toBe("infantry");
      expect(TECH_NODES, node.id).toContain(node);
    }
    // And no infantry node lives anywhere else.
    expect(
      TECH_NODES.filter(
        (node) => node.kind === "infantry" || node.family === "infantry",
      ),
    ).toEqual([...INFANTRY_TECH_NODES]);
  });

  it("gives an infantry node only infantry-upgrade and squad-type effects, and shows it from the start", () => {
    for (const node of INFANTRY_TECH_NODES) {
      expect(
        node.effects.every(
          (effect) =>
            effect.kind === "infantry-upgrade" || effect.kind === "squad-type",
        ),
        node.id,
      ).toBe(true);
      expect(node.requiresFlags ?? [], node.id).toEqual([]);
    }
  });

  it("opens every tier 2 node at once and reaches each tier 3 node through one tier 2 node of the family", () => {
    for (const node of INFANTRY_TECH_NODES) {
      if (node.tier === 2) {
        expect(node.requires, node.id).toEqual([]);
        continue;
      }
      expect(node.tier, node.id).toBe(3);
      expect(node.requires, node.id).toHaveLength(1);
      const required = byId(node.requires[0]!);
      expect(
        required,
        `${node.id} requires ${node.requires[0]!}`,
      ).toBeDefined();
      expect(required?.tier).toBe(2);
    }
    expect(byId("tech.squad-armour-2")?.requires).toEqual([
      "tech.squad-armour-1",
    ]);
    expect(byId("tech.incendiary-grenades")?.requires).toEqual([
      "tech.frag-grenades",
    ]);
    expect(byId("tech.heavy-weapons")?.requires).toEqual([
      "tech.squad-armour-1",
    ]);
  });

  /**
   * An upgrade reaches every squad, so it costs a little more than the
   * part node of its tier and less than twice the next tier's: the
   * family's 265 TP is about an eighth of the §10 whole-tree budget
   * (1.3–1.6× a campaign's 1,400–1,500 TP).
   */
  it("prices each rung above the part node of its tier and the family at 265 TP", () => {
    for (const node of INFANTRY_TECH_NODES) {
      const [low, high] =
        node.tier === 2
          ? [TIER_2_COST, TIER_3_COST]
          : [TIER_3_COST, 2 * TIER_3_COST];
      expect(Number.isInteger(node.cost), node.id).toBe(true);
      expect(node.cost, node.id).toBeGreaterThan(low);
      expect(node.cost, node.id).toBeLessThan(high);
    }
    const total = INFANTRY_TECH_NODES.reduce((sum, node) => sum + node.cost, 0);
    expect(total).toBe(265);
    expect(total).toBeGreaterThan(1_820 * 0.1);
    expect(total).toBeLessThan(1_820 * 0.2);
  });

  it("grants every infantry upgrade exactly once, and each from a node of its own", () => {
    const granted = INFANTRY_TECH_NODES.flatMap((node) =>
      infantryUpgradeIdsOf(node),
    );
    expect([...granted].sort()).toEqual([...INFANTRY_UPGRADE_IDS].sort());
    for (const id of granted) {
      expect(INFANTRY_UPGRADES[id].id).toBe(id);
    }
    // Nothing outside the family grants one.
    expect(TECH_NODES.flatMap((node) => infantryUpgradeIdsOf(node))).toEqual(
      granted,
    );
  });

  it("opens the heavy weapons squad, a shipped type, from one node and nothing else", () => {
    const opened = INFANTRY_TECH_NODES.flatMap((node) =>
      squadTypeIdsOf(node).map((typeId) => [node.id, typeId]),
    );
    expect(opened).toEqual([["tech.heavy-weapons", "heavy-weapons"]]);
    expect(SQUAD_TYPES.map((type) => type.id)).toContain("heavy-weapons");
    expect(
      TECH_NODES.filter((node) =>
        squadTypeIdsOf(node).includes("heavy-weapons"),
      ).map((node) => node.id),
    ).toEqual(["tech.heavy-weapons"]);
  });
});
