import { describe, expect, it } from "vitest";

import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import { partIdsOf } from "../../tech/model/tech-effect";
import type { ForceBand } from "./calibration-forces.test-helper";
import {
  CALIBRATION_FORCES,
  everyone,
  withForce,
} from "./calibration-forces.test-helper";
import { composeCalibrationGame } from "./calibration-run.test-helper";

const BANDS = Object.keys(CALIBRATION_FORCES) as ForceBand[];

describe("the calibration forces", () => {
  const game = composeCalibrationGame(1);
  const nodes = game.content.tech.listNodes();
  const created = game.createCampaign({
    seed: 1,
    createdAt: "2026-09-26T00:00:00.000Z",
  });

  it("research only nodes the shipped tree has", () => {
    const known = new Set(nodes.map((node) => node.id));
    for (const band of BANDS) {
      for (const id of CALIBRATION_FORCES[band].tech) {
        expect(known.has(id), `${band}: ${id}`).toBe(true);
      }
    }
  });

  it("field only mech parts their own research unlocks", () => {
    const gated = new Set(nodes.flatMap((node) => partIdsOf(node)));
    for (const band of BANDS) {
      const force = CALIBRATION_FORCES[band];
      const unlocked = new Set(
        nodes
          .filter((node) => force.tech.includes(node.id))
          .flatMap((node) => partIdsOf(node)),
      );
      const loadouts = [
        force.loadout,
        ...force.reinforcements.mechs.map((mech) => mech.loadout),
      ];
      for (const loadout of loadouts) {
        for (const part of loadoutPartIds(loadout)) {
          expect(
            !gated.has(part) || unlocked.has(part),
            `${band}: ${part}`,
          ).toBe(true);
        }
      }
    }
  });

  it("deploy within the cap, the Act III force filling it", () => {
    for (const band of BANDS) {
      const state = withForce(game, created, CALIBRATION_FORCES[band]);
      const sent = everyone(state, "m");
      const size = sent.squadIds.length + sent.mechIds.length;
      expect(size, band).toBeLessThanOrEqual(MAX_DEPLOYED_UNITS);
      if (band === "act-3") expect(size).toBe(MAX_DEPLOYED_UNITS);
    }
  });

  it("put the band's ranks, refit and research on the campaign", () => {
    const force = CALIBRATION_FORCES["act-2"];
    const state = withForce(game, created, force, ["tech.frag-grenades"]);
    expect(
      state.roster.squads.every((squad) => squad.xp === force.squadXp),
    ).toBe(true);
    expect(state.roster.mechs.map((mech) => mech.loadout)).toEqual([
      force.loadout,
    ]);
    expect(state.tech.unlocked).toEqual([...force.tech, "tech.frag-grenades"]);
  });
});
