import { describe, expect, it } from "vitest";

import { MODEL_MANIFEST } from "../data/model-manifest";
import { authoredFootprint } from "./model-footprint";

describe("authoredFootprint (#1134)", () => {
  it("reads the larger side of the model's manifest footprint", () => {
    expect(authoredFootprint("bug.swarmer")).toBe(1);
    expect(authoredFootprint("bug.brute")).toBe(
      Math.max(
        MODEL_MANIFEST["bug.brute"].footprint.w,
        MODEL_MANIFEST["bug.brute"].footprint.d,
      ),
    );
  });

  it("answers one tile for an assembled mech or an unknown id", () => {
    expect(authoredFootprint(undefined)).toBe(1);
    expect(authoredFootprint("not.a.model")).toBe(1);
  });
});
