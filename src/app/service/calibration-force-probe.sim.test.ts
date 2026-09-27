/// <reference types="node" />
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import type { ActId } from "../../content/model/act-id";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { createSquadTypeAvailability } from "../../tech/service/squad-type-availability-service";
import {
  fillDeployment,
  fillLine,
  fillMarket,
} from "./calibration-fill.test-helper";
import type { DerivedForce } from "./calibration-force-probe.test-helper";
import {
  actReach,
  deriveForce,
  derivedForceLines,
  FORCE_POINTS,
  FORCE_PROBE_SEEDS,
  probeForces,
  rankName,
  ratingOf,
  snapshotsTsv,
} from "./calibration-force-probe.test-helper";
import type { CalibrationForce } from "./calibration-forces.test-helper";
import { CALIBRATION_FORCES } from "./calibration-forces.test-helper";
import { composeSweepGame, SWEEP_NOW } from "./campaign-sweep.test-helper";
import type { GameContent } from "./game-composition";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";

// ===========================================
// The calibration force probe (#1179, campaign arc §12)
// ===========================================

/**
 * Rederives the matrix's forces from the campaign sweep's Average
 * player, at the midpoint of each seed's own Act I, II and III and on
 * its arrival at the finale, for the next economy or tree retune:
 *
 * ```
 *   SIM_FORCES_OUT=/tmp/forces.txt \
 *     node_modules/.bin/vitest run --config vitest.sim.config.ts \
 *     src/app/service/calibration-force-probe.sim.test.ts
 *
 *   /tmp/forces.txt                 each band's derived force beside the committed one
 *   /tmp/forces.txt.snapshots.tsv   every seed's force at every point
 * ```
 *
 * Each band's `fill` line is what its median bank buys to fill the
 * deployment to the cap by `fillDeployment`'s rule. It reports; it does
 * not edit `CALIBRATION_FORCES`. Copy what changed into
 * `calibration-forces.test-helper.ts` by hand and rerun the matrix.
 * Skipped unless `SIM_FORCES_OUT` is set; 24 campaigns take a few
 * seconds.
 */
const OUT = process.env.SIM_FORCES_OUT;

describe.skipIf(OUT === undefined)("the calibration force probe", () => {
  it("derives each band's force from the Average player's campaigns", () => {
    const out = OUT ?? "";
    const game = composeSweepGame(CAMPAIGN_SWEEP_TUNING.players.average);
    const nodes = game.content.tech.listNodes();
    const created = game.createCampaign({ seed: 1, createdAt: SWEEP_NOW });
    const starterUnits =
      created.roster.squads.length + created.roster.mechs.length;
    const probe = probeForces();
    const lines = [
      `seeds\t${String(FORCE_PROBE_SEEDS)} (Average player, endlessStory)`,
      `starter.rating\t${String(ratingOf(STARTER_LOADOUT, game.content))}`,
      `starter.units\t${String(starterUnits)}`,
    ];
    for (const band of ACT_IDS) {
      const reach = actReach(probe, band);
      const derived = deriveForce(
        probe.snapshots,
        band,
        STARTER_LOADOUT,
        nodes,
        game.content,
      );
      const market = fillMarket(
        game.content.squadTypes,
        createSquadTypeAvailability(game.content.tech, {
          unlocked: derived.research,
        }),
        derived.cost,
      );
      const fill = fillDeployment(
        derived.credits,
        MAX_DEPLOYED_UNITS - starterUnits,
        market,
      );
      lines.push(
        `${band}.point\t${FORCE_POINTS[band].kind}`,
        `${band}.reached\t${String(reach.seeds)} seeds, the act beginning at mission ${String(reach.start)} (median)`,
        ...derivedForceLines(`${band}.derived`, derived),
        `${band}.derived.fill\t${fillLine(fill, market)}`,
        ...committedLines(
          band,
          CALIBRATION_FORCES[band],
          starterUnits,
          game.content,
        ),
        ...researchDiff(band, derived, CALIBRATION_FORCES[band]),
      );
      expect(derived.seeds, band).toBeGreaterThan(0);
    }
    writeFileSync(out, lines.join("\n") + "\n");
    writeFileSync(`${out}.snapshots.tsv`, snapshotsTsv(probe.snapshots));
  });
});

// ===========================================
// Private
// ===========================================

/** The committed force as `key<TAB>value` lines, beside the derived one. */
function committedLines(
  band: ActId,
  force: CalibrationForce,
  starterUnits: number,
  content: GameContent,
): readonly string[] {
  const units =
    starterUnits +
    force.reinforcements.squads.length +
    force.reinforcements.mechs.length;
  return [
    `${band}.committed.squad_xp\t${String(force.squadXp)} (${rankName(force.squadXp)})`,
    `${band}.committed.mech_xp\t${String(force.mechXp)} (${rankName(force.mechXp)})`,
    `${band}.committed.research\t${String(force.tech.length)}: ${force.tech.join(", ")}`,
    `${band}.committed.rating\t${String(ratingOf(force.loadout, content))}`,
    `${band}.committed.units\t${String(units)}: + ${[
      ...force.reinforcements.mechs.map(() => "mech"),
      ...force.reinforcements.squads.map((squad) => squad.typeId),
    ].join(", ")}`,
    `${band}.committed.bank\t${String(force.bank.before)} → ${String(force.bank.after)}`,
  ];
}

/**
 * The nodes the derived force holds and the committed one lacks, and the
 * reverse: both empty when the research still matches, bar a story gate
 * the force adds on top (Act II's Pheromone Analysis).
 */
function researchDiff(
  band: ActId,
  derived: DerivedForce,
  force: CalibrationForce,
): readonly string[] {
  const missing = derived.research.filter((id) => !force.tech.includes(id));
  const extra = force.tech.filter((id) => !derived.research.includes(id));
  return [
    `${band}.research_missing\t${missing.join(", ")}`,
    `${band}.research_extra\t${extra.join(", ")}`,
  ];
}
