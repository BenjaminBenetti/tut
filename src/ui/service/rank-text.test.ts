import { describe, expect, it } from "vitest";

import { RANK_TUNING } from "../../roster/data/rank-tuning";
import { rankBonuses } from "../../roster/service/rank-service";
import { rankBonusPhrase, rankTooltipLines, TOP_OF_LADDER } from "./rank-text";

describe("rankTooltipLines (#1134)", () => {
  it("names the rung, its threshold and its bonuses, then the next rung", () => {
    expect(rankTooltipLines(0, RANK_TUNING)).toEqual([
      "Private · 0 xp — +0 move · +0 accuracy · +0 AP",
      "Private First Class at 10 xp: +0 move · +2 accuracy · +0 AP",
    ]);
    expect(rankTooltipLines(2, RANK_TUNING)).toEqual([
      "Corporal · 30 xp — +1 move · +4 accuracy · +0 AP",
      "Sergeant at 60 xp: +1 move · +6 accuracy · +0 AP",
    ]);
    expect(rankTooltipLines(4, RANK_TUNING)).toEqual([
      "Staff Sergeant · 100 xp — +2 move · +8 accuracy · +1 AP",
      "Sergeant First Class at 150 xp: +2 move · +10 accuracy · +1 AP",
    ]);
  });

  it("says the ladder ends at the top rung", () => {
    expect(rankTooltipLines(8, RANK_TUNING)).toEqual([
      "Sergeant Major · 360 xp — +4 move · +16 accuracy · +2 AP",
      TOP_OF_LADDER,
    ]);
  });

  it("clamps an index off the ladder and says nothing for an empty one", () => {
    expect(rankTooltipLines(99, RANK_TUNING)[1]).toBe(TOP_OF_LADDER);
    expect(rankTooltipLines(-3, RANK_TUNING)[0]).toMatch(/^Private · 0 xp/);
    expect(rankTooltipLines(0, { ...RANK_TUNING, ladder: [] })).toEqual([]);
  });

  it("reads the bonuses from rankBonuses rather than its own arithmetic", () => {
    const tuning = {
      ...RANK_TUNING,
      bonuses: { movePerRank: 1, accuracyPerRank: 3, apPerRank: 0.5 },
    };
    const bonuses = rankBonuses(3, tuning.bonuses);
    expect(rankBonusPhrase(3, tuning)).toBe(
      `+${String(bonuses.move)} move · +${String(bonuses.accuracy)} accuracy · +${String(bonuses.ap)} AP`,
    );
  });
});
