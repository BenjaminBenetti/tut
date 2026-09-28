import { describe, expect, it } from "vitest";

import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import { loadoutPartIds } from "../../roster/model/mech-loadout";
import { partIdsOf } from "../../tech/model/tech-effect";
import { createSquadTypeAvailability } from "../../tech/service/squad-type-availability-service";
import { fillDeployment, fillMarket } from "./calibration-fill.test-helper";
import { costOf } from "./calibration-force-probe.test-helper";
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

  it("fill the deployment to the cap in every band", () => {
    for (const band of BANDS) {
      const state = withForce(game, created, CALIBRATION_FORCES[band]);
      const sent = everyone(state, "m");
      const size = sent.squadIds.length + sent.mechIds.length;
      expect(size, band).toBe(MAX_DEPLOYED_UNITS);
    }
  });

  it("buy their reinforcements from the band's bank by the fill rule", () => {
    const starters = created.roster.squads.length + created.roster.mechs.length;
    for (const band of BANDS) {
      const force = CALIBRATION_FORCES[band];
      const availability = createSquadTypeAvailability(game.content.tech, {
        unlocked: force.tech,
      });
      const market = fillMarket(
        game.content.squadTypes,
        availability,
        costOf(force.loadout, game.content),
      );
      const fill = fillDeployment(
        force.bank.before,
        MAX_DEPLOYED_UNITS - starters,
        market,
      );
      const { squads, mechs } = force.reinforcements;
      expect(
        squads.map((squad) => squad.typeId),
        band,
      ).toEqual(fill.squads);
      expect(mechs.length, band).toBe(fill.mechs);
      for (const mech of mechs)
        expect(mech.loadout, band).toEqual(force.loadout);
      expect(force.bank.after, band).toBe(fill.bankAfter);
      for (const credits of [force.bank.before, force.bank.after]) {
        expect(force.basis, band).toContain(credits.toLocaleString("en-US"));
      }
    }
  });

  it("put the band's ranks, refit and research on the campaign", () => {
    const force = CALIBRATION_FORCES["act-2"];
    const state = withForce(game, created, force, ["tech.frag-grenades"]);
    const starters = created.roster.squads.length;
    expect(state.roster.squads.map((squad) => squad.xp)).toEqual([
      ...created.roster.squads.map(() => force.squadXp),
      ...force.reinforcements.squads.map(() => force.reinforcementXp),
    ]);
    expect(state.roster.squads.slice(starters).map((s) => s.typeId)).toEqual(
      force.reinforcements.squads.map((squad) => squad.typeId),
    );
    expect(state.roster.mechs.map((mech) => mech.xp)).toEqual([
      force.mechXp,
      ...force.reinforcements.mechs.map(() => force.reinforcementXp),
    ]);
    expect(state.roster.mechs.map((mech) => mech.loadout)).toEqual([
      force.loadout,
      ...force.reinforcements.mechs.map((mech) => mech.loadout),
    ]);
    expect(state.tech.unlocked).toEqual([...force.tech, "tech.frag-grenades"]);
  });
});
