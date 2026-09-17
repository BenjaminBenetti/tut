import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployable } from "../../overworld/model/deployable";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import {
  buildInstallationWheel,
  INSTALLATION_WHEEL_DECOMMISSION_ITEM,
  INSTALLATION_WHEEL_REGION_ITEM,
  INSTALLATION_WHEEL_UPGRADE_ITEM,
  installationWheelChoice,
  MAX_LEVEL_REASON,
} from "./installation-wheel";

const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

const built = (
  level: Deployable["level"],
  online = true,
  typeId: Deployable["typeId"] = "defensive-battery",
): Deployable => ({
  id: "deployable-1",
  typeId,
  regionId: "east-asia",
  level,
  builtDay: 1,
  online,
});

/** A new game holding `deployables` with `credits` in the treasury. */
function stateWith(deployables: Deployable[], credits: number): GameState {
  const base = createNewGame(
    { seed: 5, createdAt: "2026-09-16T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  return {
    ...base,
    overworld: { ...base.overworld, deployables },
    economy: { ...base.economy, credits },
  };
}

describe("buildInstallationWheel (#1155)", () => {
  it("puts the level at the hub over the type and status, with the effect as the note", () => {
    const wheel = buildInstallationWheel(
      stateWith([built(1)], 5000),
      "deployable-1",
      CATALOGUE,
    );
    expect(wheel?.hub).toEqual({
      value: "L1",
      caption: "Defensive battery · online",
      tone: "ok",
      note: "1 garrison turret on every mission map",
    });
    expect(wheel?.items.map((item) => item.id)).toEqual([
      INSTALLATION_WHEEL_UPGRADE_ITEM,
      INSTALLATION_WHEEL_DECOMMISSION_ITEM,
      INSTALLATION_WHEEL_REGION_ITEM,
    ]);
  });

  it("offers Upgrade as the primary entry with the next level's price while affordable", () => {
    const wheel = buildInstallationWheel(
      stateWith([built(1)], 5000),
      "deployable-1",
      CATALOGUE,
    );
    expect(wheel?.items[0]).toMatchObject({
      label: "Upgrade",
      detail: "L2 · ¢1,500",
      primary: true,
    });
    expect(wheel?.items[0]?.disabled).toBeUndefined();
    expect(wheel?.items[1]).toMatchObject({
      label: "Decommission",
      detail: "stops ¢50/day",
    });
  });

  it("disables Upgrade with the shortfall when the treasury cannot cover it", () => {
    const wheel = buildInstallationWheel(
      stateWith([built(2)], 100),
      "deployable-1",
      CATALOGUE,
    );
    expect(wheel?.hub.value).toBe("L2");
    expect(wheel?.items[0]).toMatchObject({
      disabled: true,
      reason: "Need ¢2,000, have ¢100",
      detail: "L3 · ¢2,000",
    });
    expect(wheel?.items[0]?.primary).toBeUndefined();
  });

  it("disables Upgrade as Max level at L3 and tones an offline installation as a warning", () => {
    const wheel = buildInstallationWheel(
      stateWith([built(3, false)], 99999),
      "deployable-1",
      CATALOGUE,
    );
    expect(wheel?.hub).toMatchObject({
      value: "L3",
      caption: "Defensive battery · offline",
      tone: "warn",
    });
    expect(wheel?.items[0]).toMatchObject({
      disabled: true,
      reason: MAX_LEVEL_REASON,
    });
    expect(wheel?.items[0]?.detail).toBeUndefined();
  });

  it("joins a multi-axis effect into one note and answers nothing for an unknown installation", () => {
    const wheel = buildInstallationWheel(
      stateWith([built(1, true, "sensor-array")], 5000),
      "deployable-1",
      CATALOGUE,
    );
    expect(wheel?.hub.note).toBe(
      "Finds infested cities at 60% of the usual infestation · Missions stay on offer 1 day longer",
    );
    expect(
      buildInstallationWheel(stateWith([], 5000), "deployable-1", CATALOGUE),
    ).toBeUndefined();
  });
});

describe("installationWheelChoice", () => {
  it("maps the ring's ids back to choices, and unknown ids to nothing", () => {
    expect(installationWheelChoice("upgrade")).toEqual({ kind: "upgrade" });
    expect(installationWheelChoice("decommission")).toEqual({
      kind: "decommission",
    });
    expect(installationWheelChoice("region")).toEqual({ kind: "region" });
    expect(installationWheelChoice("mission:x")).toBeUndefined();
  });
});
