import { describe, expect, it } from "vitest";

import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import type { DeployableType } from "../model/deployable-type";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import { DataDeployableTypeCatalogue } from "./deployable-type-catalogue";

const ALL = DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]);

describe("DataDeployableTypeCatalogue", () => {
  it("looks up types by id and reports unknown ids as undefined", () => {
    const catalogue = new DataDeployableTypeCatalogue(ALL);
    expect(catalogue.getDeployableType("sensor-array")?.name).toBe(
      "Sensor array",
    );
    expect(
      catalogue.getDeployableType("orbital-laser" as DeployableType["id"]),
    ).toBeUndefined();
  });

  it("lists types in the order supplied", () => {
    const catalogue = new DataDeployableTypeCatalogue([...ALL].reverse());
    expect(catalogue.listDeployableTypes().map((t) => t.id)).toEqual(
      [...DEPLOYABLE_TYPE_IDS].reverse(),
    );
  });

  it("rejects duplicate ids", () => {
    const battery = DEPLOYABLE_TYPES["defensive-battery"];
    expect(() => new DataDeployableTypeCatalogue([battery, battery])).toThrow(
      /Duplicate/,
    );
  });
});
