import { describe, expect, it } from "vitest";

import type { CampaignState } from "../../overworld/model/campaign-state";
import type { GameState } from "./game-state";

/** `true` when `A` is assignable to `B`, checked by the compiler. */
type Assignable<A, B> = A extends B ? true : false;

describe("GameState", () => {
  it("satisfies the overworld's CampaignState so the dispatcher can drive it", () => {
    const assignable: Assignable<GameState, CampaignState> = true;
    expect(assignable).toBe(true);
  });
});
