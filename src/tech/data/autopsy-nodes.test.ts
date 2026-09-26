import { describe, expect, it } from "vitest";

import { KILL_GROUPS } from "../../bugs/data/kill-groups";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import { KILL_GROUP_IDS } from "../../content/model/kill-group-id";
import {
  ACID_RESISTANT_PLATING,
  ARMOUR_PIERCING_ROUNDS,
  AUTOPSY_PARTS,
  MATRIARCH_CHITIN,
  SEISMIC_SENSOR,
  SPINE_PLATE_ARMOUR,
} from "../../roster/data/autopsy-parts";
import { isTechNodeHidden } from "../service/tech-status-service";
import { killedFlag, killedSpeciesOf } from "../model/tech-conditions";
import { partIdsOf } from "../model/tech-effect";
import { AUTOPSY_NODES } from "./autopsy-nodes";
import { TECH_NODES } from "./tech-tree";

/** The species or kill group whose kill reveals `node`, read off its one flag. */
const speciesOf = (node: (typeof AUTOPSY_NODES)[number]): string | undefined =>
  killedSpeciesOf(node.requiresFlags?.[0] ?? "");

describe("AUTOPSY_NODES (campaign arc §8, §10.2)", () => {
  it("is every autopsy of the shipped tree, each in it", () => {
    for (const node of AUTOPSY_NODES) {
      expect(TECH_NODES, node.id).toContain(node);
    }
    expect(TECH_NODES.filter((node) => node.kind === "autopsy")).toEqual([
      ...AUTOPSY_NODES,
    ]);
  });

  it("hides each behind exactly one kill flag, of a species or kill group the game ships", () => {
    const killable = new Set<string>([...BUG_SPECIES_IDS, ...KILL_GROUP_IDS]);
    for (const node of AUTOPSY_NODES) {
      expect(node.requiresFlags, node.id).toHaveLength(1);
      const species = speciesOf(node);
      expect(killable.has(species ?? ""), node.id).toBe(true);
      expect(node.requiresFlags).toEqual([killedFlag(species ?? "")]);
    }
  });

  it("gives each species or group at most one autopsy", () => {
    const species = AUTOPSY_NODES.map(speciesOf);
    expect(new Set(species).size).toBe(species.length);
  });

  it("files each under xenobiology on the inner ring, at 20–40 TP, with no prerequisite but the kill", () => {
    for (const node of AUTOPSY_NODES) {
      expect(node.kind, node.id).toBe("autopsy");
      expect(node.family, node.id).toBe("xenobiology");
      expect(node.tier, node.id).toBe(2);
      expect(node.requires, node.id).toEqual([]);
      expect(node.cost, node.id).toBeGreaterThanOrEqual(20);
      expect(node.cost, node.id).toBeLessThanOrEqual(40);
    }
  });

  it("unlocks one counter part each, and every counter from exactly one autopsy", () => {
    const counters = AUTOPSY_NODES.map((node) => {
      expect(node.effects, node.id).toHaveLength(1);
      expect(node.effects[0]?.kind, node.id).toBe("part");
      return partIdsOf(node)[0];
    });
    expect([...counters].sort()).toEqual(
      AUTOPSY_PARTS.map((part) => part.id).sort(),
    );
  });

  it("counters each species or group with its own part", () => {
    const counterOf = (species: string): string | undefined =>
      AUTOPSY_NODES.filter((node) => speciesOf(node) === species).flatMap(
        partIdsOf,
      )[0];
    expect(counterOf("spitter")).toBe(ACID_RESISTANT_PLATING);
    expect(counterOf("hive-guard")).toBe(SPINE_PLATE_ARMOUR);
    expect(counterOf("burrower")).toBe(SEISMIC_SENSOR);
    expect(counterOf("broodmother")).toBe(MATRIARCH_CHITIN);
    expect(counterOf("armoured-carapace")).toBe(ARMOUR_PIERCING_ROUNDS);
  });

  it("keeps the five autopsies inside the arc's 100–200 TP", () => {
    const total = AUTOPSY_NODES.reduce((sum, node) => sum + node.cost, 0);
    expect(AUTOPSY_NODES).toHaveLength(5);
    expect(total).toBeGreaterThanOrEqual(100);
    expect(total).toBeLessThanOrEqual(200);
  });
});

describe("the W6 autopsies (campaign arc §10.2)", () => {
  /** The shipped node by id. */
  const node = (id: string): (typeof AUTOPSY_NODES)[number] => {
    const found = AUTOPSY_NODES.find((each) => each.id === id);
    if (found === undefined) {
      throw new Error(`no autopsy ${id}`);
    }
    return found;
  };
  /** The flags a campaign that has killed `species` holds, groups derived as the overworld does. */
  const killed = (...species: string[]): { flags: ReadonlySet<string> } => ({
    flags: new Set([
      ...species.map(killedFlag),
      ...Object.values(KILL_GROUPS)
        .filter((group) =>
          group.members.some((member) => species.includes(member)),
        )
        .map((group) => killedFlag(group.id)),
    ]),
  });

  it.each([
    ["tech.burrower-autopsy", "burrower", SEISMIC_SENSOR, 30],
    ["tech.broodmother-autopsy", "broodmother", MATRIARCH_CHITIN, 40],
  ])(
    "hides %s until a %s dies, prices it and unlocks its counter",
    (id, species, part, cost) => {
      const autopsy = node(id);
      expect(isTechNodeHidden(autopsy, killed())).toBe(true);
      expect(isTechNodeHidden(autopsy, killed("swarmer", "spitter"))).toBe(
        true,
      );
      expect(isTechNodeHidden(autopsy, killed(species))).toBe(false);
      expect(autopsy.cost).toBe(cost);
      expect(partIdsOf(autopsy)).toEqual([part]);
    },
  );

  it.each(["swarmer-armoured", "lurker-armoured", "brute-armoured"])(
    "shows the armoured carapace autopsy on the first kill of a %s",
    (variant) => {
      const autopsy = node("tech.armoured-autopsy");
      expect(isTechNodeHidden(autopsy, killed(variant))).toBe(false);
      expect(autopsy.cost).toBe(40);
      expect(partIdsOf(autopsy)).toEqual([ARMOUR_PIERCING_ROUNDS]);
    },
  );

  it("keeps the armoured carapace autopsy hidden while only the plain bases have died", () => {
    const autopsy = node("tech.armoured-autopsy");
    expect(isTechNodeHidden(autopsy, killed())).toBe(true);
    expect(
      isTechNodeHidden(autopsy, killed("swarmer", "lurker", "brute")),
    ).toBe(true);
  });
});
