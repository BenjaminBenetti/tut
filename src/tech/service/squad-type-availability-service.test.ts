import { describe, expect, it } from "vitest";

import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { TECH_FAMILIES } from "../data/tech-families";
import { TECH_NODES } from "../data/tech-tree";
import { StaticTechCatalogue } from "../repository/static-tech-catalogue";
import {
  createSquadTypeAvailability,
  gatedSquadTypeIds,
  lockedSquadTypes,
  unlockedSquadTypeIds,
} from "./squad-type-availability-service";

const TECH = new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES));

describe("gatedSquadTypeIds", () => {
  it("is the heavy weapons squad alone in the shipped tree", () => {
    expect([...gatedSquadTypeIds(TECH)]).toEqual(["heavy-weapons"]);
  });
});

describe("unlockedSquadTypeIds", () => {
  it("unions the types of every unlocked node and ignores an unknown one", () => {
    expect([...unlockedSquadTypeIds(TECH, { unlocked: [] })]).toEqual([]);
    expect([
      ...unlockedSquadTypeIds(TECH, {
        unlocked: ["tech.jump-jets", "tech.heavy-weapons", "tech.gone"],
      }),
    ]).toEqual(["heavy-weapons"]);
  });
});

describe("createSquadTypeAvailability (campaign arc §10.3)", () => {
  it("keeps every starting type for hire and the heavy weapons squad locked until its node is unlocked", () => {
    const fresh = createSquadTypeAvailability(TECH, { unlocked: [] });
    for (const type of SQUAD_TYPES) {
      expect(fresh.isAvailable(type.id), type.id).toBe(
        type.id !== "heavy-weapons",
      );
    }
    // Its prerequisite alone does not open it.
    expect(
      createSquadTypeAvailability(TECH, {
        unlocked: ["tech.squad-armour-1"],
      }).isAvailable("heavy-weapons"),
    ).toBe(false);
    const later = createSquadTypeAvailability(TECH, {
      unlocked: ["tech.squad-armour-1", "tech.heavy-weapons"],
    });
    for (const type of SQUAD_TYPES) {
      expect(later.isAvailable(type.id), type.id).toBe(true);
    }
  });

  it("leaves a type no node names for hire, whatever the catalogue", () => {
    const fresh = createSquadTypeAvailability(TECH, { unlocked: [] });
    expect(fresh.isAvailable("cavalry")).toBe(true);
  });
});

describe("lockedSquadTypes", () => {
  it("maps each locked type to the node that opens it, and empties once it is open", () => {
    const locked = lockedSquadTypes(TECH, { unlocked: [] });
    expect([...locked.keys()]).toEqual(["heavy-weapons"]);
    expect(locked.get("heavy-weapons")?.id).toBe("tech.heavy-weapons");
    expect(
      lockedSquadTypes(TECH, { unlocked: ["tech.heavy-weapons"] }).size,
    ).toBe(0);
  });
});
