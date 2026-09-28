import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import type { ActId } from "../../content/model/act-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Mission } from "../../overworld/model/mission";
import { probeEconomy } from "./campaign-economy-probe.test-helper";
import { composeSweepGame, SWEEP_NOW } from "./campaign-sweep.test-helper";
import type { MatrixDraw } from "./matrix-losses.test-helper";
import {
  dealLosses,
  forceShape,
  MatrixLossTable,
  matrixLosses,
  matrixPlayer,
  readMatrixRuns,
} from "./matrix-losses.test-helper";
import { CAMPAIGN_SWEEP_TUNING } from "./modelled-player.test-helper";
import { REALISTIC_SPENDING } from "./realistic-spender.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** The runs.tsv header, extra columns included, as the matrix writes it. */
const HEADER =
  "cell\tseed\tplayer\tluck\tdifficulty\toutcome\tabandoned\tturns\tunits_lost\tmechs_lost\tdeployed\twall_s";

/** One runs.tsv row. */
function row(
  cell: string,
  player: string,
  outcome: string,
  unitsLost: number,
  mechsLost: number,
  luck = player,
  abandoned = "",
): string {
  return [
    cell,
    "0",
    player,
    luck,
    "3",
    outcome,
    abandoned,
    "9",
    String(unitsLost),
    String(mechsLost),
    "8",
    "1.0",
  ].join("\t");
}

/**
 * A small matrix: crash sites in Acts I and III (none in Act II), an
 * alpha hunt in Act II, one story cell, and a decision-gap run.
 */
const RUNS_TSV = [
  HEADER,
  row("crash-site/act-1", "new", "won", 2, 1),
  row("crash-site/act-1", "new", "lost", 8, 3, "new", "stall"),
  row("crash-site/act-3", "new", "won", 1, 0),
  row("alpha-hunt/act-2", "new", "won", 3, 0),
  row("story:live-specimen/act-1", "new", "won", 0, 0),
  row("story:live-specimen/act-1", "expert", "won", 4, 2, "new"),
  row("crash-site/act-1", "expert", "won", 0, 0),
  "",
].join("\n");

const RUNS = readMatrixRuns(RUNS_TSV);
const NEW = MatrixLossTable.of(RUNS, "new");

/** A real offer, retyped: the table reads only its type, story and act. */
const OFFER: Mission = (() => {
  const game = composeSweepGame(CAMPAIGN_SWEEP_TUNING.players.average);
  const fresh = game.createCampaign({ seed: 3, createdAt: SWEEP_NOW });
  const applied = game.dispatcher.process(fresh, advanceDay());
  if (!applied.ok) throw new Error(JSON.stringify(applied.error));
  const offer = applied.value.state.overworld.missions[0];
  if (offer === undefined) throw new Error("the first board has an offer");
  return offer;
})();

/** `OFFER` as a mission of `typeId` offered in `act`, or a story's. */
function mission(
  typeId: MissionTypeId,
  act: ActId | undefined,
  storyId?: StoryMissionId,
): Mission {
  const { act: _act, storyId: _story, ...rest } = OFFER;
  return {
    ...rest,
    typeId,
    ...(act === undefined ? {} : { act }),
    ...(storyId === undefined ? {} : { storyId }),
  };
}

/** The starting roster, and a worn mech beside it, all deployed. */
const ROSTER = (() => {
  const game = composeSweepGame(CAMPAIGN_SWEEP_TUNING.players.average);
  const fresh = game.createCampaign({ seed: 3, createdAt: SWEEP_NOW });
  const mech = fresh.roster.mechs[0];
  if (mech === undefined) throw new Error("the starter has a mech");
  return {
    squads: fresh.roster.squads,
    mechs: [mech, { ...mech, id: "mech-worn", damage: 95 }],
  };
})();
const EVERYONE = {
  missionId: OFFER.id,
  squadIds: ROSTER.squads.map((squad) => squad.id),
  mechIds: ROSTER.mechs.map((mech) => mech.id),
};

// ===========================================
// Reading the runs
// ===========================================

describe("readMatrixRuns (#1179)", () => {
  it("reads each own-dice run's squads and mechs lost out of the band's force", () => {
    expect(RUNS).toHaveLength(6);
    expect(RUNS[0]).toEqual({
      cell: "crash-site/act-1",
      band: "act-1",
      player: "new",
      outcome: "won",
      abandoned: "",
      squads: { deployed: 5, lost: 1 },
      mechs: { deployed: 3, lost: 1 },
    });
    expect(RUNS[1]?.abandoned).toBe("stall");
    expect(
      RUNS.filter((run) => run.cell.startsWith("story:")).map(
        (run) => run.player,
      ),
    ).toEqual(["new"]);
  });

  it("deploys the calibration force: the four starting squads and the medic, three mechs", () => {
    for (const band of ACT_IDS) {
      expect(forceShape(band)).toEqual({ squads: 5, mechs: 3 });
    }
  });

  it("refuses a file it cannot read as the matrix's", () => {
    expect(() =>
      readMatrixRuns(RUNS_TSV.replace("units_lost", "lost")),
    ).toThrow("units_lost");
    expect(() =>
      readMatrixRuns(
        `${HEADER}\n${row("crash-site/act-1", "new", "won", 1, 0).replace("\t8\t", "\t6\t")}`,
      ),
    ).toThrow("deployed 6");
    expect(() =>
      readMatrixRuns(
        `${HEADER}\n${row("crash-site/act-9", "new", "won", 1, 0)}`,
      ),
    ).toThrow("no band");
  });
});

// ===========================================
// The table
// ===========================================

describe("MatrixLossTable (#1179)", () => {
  it("maps a mission to its story's cell, its type's cell in its act, the nearest act's, or the act's pool", () => {
    expect(NEW.cellOf(mission("crash-site", "act-3", "live-specimen"))).toEqual(
      { cell: "story:live-specimen/act-1", route: "story" },
    );
    expect(
      NEW.cellOf(mission("alpha-hunt", "act-2", "broodmother-sighting")),
    ).toEqual({ cell: "alpha-hunt/act-2", route: "type" });
    expect(NEW.cellOf(mission("crash-site", "act-3"))).toEqual({
      cell: "crash-site/act-3",
      route: "type",
    });
    expect(NEW.cellOf(mission("alpha-hunt", "finale"))).toEqual({
      cell: "alpha-hunt/act-2",
      route: "nearest-band",
    });
    expect(NEW.cellOf(mission("crash-site", "act-2"))).toEqual({
      cell: "crash-site/act-1",
      route: "nearest-band",
    });
    expect(NEW.cellOf(mission("tunnel-sabotage", "act-2"))).toEqual({
      cell: "band:act-2",
      route: "band",
    });
    expect(NEW.cellOf(mission("crash-site", undefined)).cell).toBe(
      "crash-site/act-1",
    );
  });

  it("draws a run of the mission's outcome from its cell, else its band, else anywhere", () => {
    const rng = new Mulberry32Rng(4);
    const won = NEW.draw(mission("crash-site", "act-1"), "won", rng);
    expect([won.pool, won.run.cell, won.run.outcome]).toEqual([
      "cell",
      "crash-site/act-1",
      "won",
    ]);
    const lostInAct1 = NEW.draw(mission("crash-site", "act-3"), "lost", rng);
    expect([lostInAct1.pool, lostInAct1.run.cell]).toEqual([
      "any",
      "crash-site/act-1",
    ]);
    const wonInBand = NEW.draw(mission("tunnel-sabotage", "act-2"), "won", rng);
    expect([wonInBand.pool, wonInBand.run.cell]).toEqual([
      "band",
      "alpha-hunt/act-2",
    ]);
    const lostNearby = NEW.draw(mission("crash-site", "act-2"), "lost", rng);
    expect([lostNearby.pool, lostNearby.run.cell]).toEqual([
      "cell",
      "crash-site/act-1",
    ]);
    const storyWon = NEW.draw(
      mission("crash-site", "act-1", "live-specimen"),
      "won",
      rng,
    );
    expect(storyWon.run.squads.lost + storyWon.run.mechs.lost).toBe(0);
    expect(() =>
      NEW.draw(mission("crash-site", "act-1"), "extracted", rng),
    ).toThrow("no new run that extracted");
  });

  it("draws each run of the pool, with the mission's stream", () => {
    const table = MatrixLossTable.of(
      readMatrixRuns(
        [
          HEADER,
          row("crash-site/act-1", "new", "won", 0, 0),
          row("crash-site/act-1", "new", "won", 5, 0),
        ].join("\n"),
      ),
      "new",
    );
    const rng = new Mulberry32Rng(9);
    const lost = Array.from(
      { length: 200 },
      () =>
        table.draw(mission("crash-site", "act-1"), "won", rng).run.squads.lost,
    );
    expect(lost.filter((each) => each === 5).length).toBeGreaterThan(70);
    expect(lost.filter((each) => each === 0).length).toBeGreaterThan(70);
  });

  it("tabulates each cell's runs by outcome, with their mean losses", () => {
    expect(NEW.rows()).toContainEqual({
      cell: "crash-site/act-1",
      outcome: "lost",
      runs: 1,
      squadsLost: 5,
      mechsLost: 3,
      abandoned: 1,
    });
    expect(NEW.rows()).toHaveLength(5);
    expect(() => MatrixLossTable.of(RUNS.slice(0, 1), "expert")).toThrow(
      "no expert run",
    );
  });
});

// ===========================================
// Dealing the losses
// ===========================================

describe("dealLosses (#1179)", () => {
  it("loses exactly the run's units when the deployment matches the run's", () => {
    const rng = new Mulberry32Rng(2);
    for (let trial = 0; trial < 20; trial++) {
      const dealt = dealLosses({ deployed: 5, lost: 2 }, 5, rng);
      expect(dealt.filter(Boolean)).toHaveLength(2);
    }
  });

  it("deals a smaller deployment its share, and a larger one from the slots repeated", () => {
    const rng = new Mulberry32Rng(3);
    let fewer = 0;
    let more = 0;
    for (let trial = 0; trial < 500; trial++) {
      fewer += dealLosses({ deployed: 5, lost: 2 }, 3, rng).filter(
        Boolean,
      ).length;
      const dealt = dealLosses({ deployed: 3, lost: 3 }, 4, rng);
      expect(dealt).toHaveLength(4);
      more += dealt.filter(Boolean).length;
    }
    expect(fewer / 500).toBeGreaterThan(1.1);
    expect(fewer / 500).toBeLessThan(1.3);
    expect(more).toBe(4 * 500);
  });

  it("loses nothing when the run deployed none of the kind or nobody went", () => {
    const rng = new Mulberry32Rng(1);
    expect(dealLosses({ deployed: 0, lost: 0 }, 2, rng)).toEqual([
      false,
      false,
    ]);
    expect(dealLosses({ deployed: 5, lost: 5 }, 0, rng)).toEqual([]);
  });
});

// ===========================================
// The loss model and the players
// ===========================================

describe("matrixLosses (#1179)", () => {
  it("wipes every dealt-lost squad and destroys every dealt-lost mech, and brings the rest home whole", () => {
    const table = MatrixLossTable.of(
      readMatrixRuns(
        [
          HEADER,
          row("crash-site/act-1", "new", "lost", 8, 3),
          row("crash-site/act-1", "new", "won", 0, 0),
        ].join("\n"),
      ),
      "new",
    );
    const seen: MatrixDraw[] = [];
    const model = matrixLosses(table, (draw) => seen.push(draw));
    const lost = model.roll(
      "lost",
      mission("crash-site", "act-1"),
      EVERYONE,
      ROSTER,
      new Mulberry32Rng(6),
    );
    expect(lost.squadsWiped).toEqual(EVERYONE.squadIds);
    expect(lost.squadCasualties).toEqual(
      ROSTER.squads.map((squad) => ({
        squadId: squad.id,
        losses: squad.strength,
      })),
    );
    expect(lost.mechsDestroyed).toEqual(EVERYONE.mechIds);
    expect(lost.mechDamage.map((each) => each.damage)).toEqual([100, 5]);
    const won = model.roll(
      "won",
      mission("crash-site", "act-1"),
      EVERYONE,
      ROSTER,
      new Mulberry32Rng(6),
    );
    expect(won).toEqual({
      squadCasualties: [],
      squadsWiped: [],
      mechDamage: [],
      mechsDestroyed: [],
    });
    expect(seen.map((draw) => draw.run.outcome)).toEqual(["lost", "won"]);
  });

  it("is the realistic spender on the table's losses, and its campaign re-hires what the matrix kills", () => {
    const table = MatrixLossTable.of(
      readMatrixRuns(
        [
          HEADER,
          ...ACT_IDS.flatMap((band) => [
            row(`crash-site/${band}`, "new", "won", 1, 0),
            row(`crash-site/${band}`, "new", "extracted", 1, 0),
            row(`crash-site/${band}`, "new", "lost", 8, 3),
          ]),
        ].join("\n"),
      ),
      "new",
    );
    const { player, spending } = matrixPlayer(table);
    expect(player.id).toBe("matrix-new");
    expect(spending).toBe(REALISTIC_SPENDING);
    expect(player.outcomes).toEqual(
      CAMPAIGN_SWEEP_TUNING.players.average.outcomes,
    );
    const [economy] = probeEconomy(player, [1], { spending });
    if (economy === undefined) throw new Error("seed 1 was played");
    const total = (pick: (band: ActId) => number): number =>
      ACT_IDS.reduce((sum, band) => sum + pick(band), 0);
    expect(
      total((band) => economy.bands[band].losses.squadsWiped),
    ).toBeGreaterThan(20);
    expect(
      total((band) => economy.bands[band].account["squad-hire"]),
    ).toBeGreaterThan(20 * 500);
    expect(total((band) => economy.bands[band].account.repair)).toBe(0);
  });

  it("leaves a player the matrix empties with nobody to send: the campaign plays on without a mission until it rebuilds, and the probe counts those days grounded", () => {
    const wipe = MatrixLossTable.of(
      readMatrixRuns(
        [
          HEADER,
          ...ACT_IDS.flatMap((band) =>
            ["won", "extracted", "lost"].map((outcome) =>
              row(`crash-site/${band}`, "new", outcome, 8, 3),
            ),
          ),
        ].join("\n"),
      ),
      "new",
    );
    const average = CAMPAIGN_SWEEP_TUNING.players.average;
    const [economy] = probeEconomy(
      { ...average, losses: matrixLosses(wipe) },
      [1],
    );
    if (economy === undefined) throw new Error("seed 1 was played");
    const total = (pick: (band: ActId) => number): number =>
      ACT_IDS.reduce((sum, band) => sum + pick(band), 0);
    const grounded = total((band) => economy.bands[band].force.groundedDays);
    expect(grounded).toBeGreaterThan(10);
    expect(economy.record.missions + grounded).toBeLessThanOrEqual(
      economy.record.days,
    );
    expect(economy.record.mechsBuilt).toBeGreaterThan(1);
  });
});
