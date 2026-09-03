import { describe, expect, it } from "vitest";

import { formatWhole } from "./format";
import { THREAT_BAND_UPPER, threatTone } from "./threat-band";

describe("threatTone", () => {
  it("is green up to the first bound, amber up to the second, red above", () => {
    expect(threatTone(0)).toBe("ok");
    expect(threatTone(THREAT_BAND_UPPER.ok)).toBe("ok");
    expect(threatTone(THREAT_BAND_UPPER.ok + 1)).toBe("warn");
    expect(threatTone(THREAT_BAND_UPPER.warn)).toBe("warn");
    expect(threatTone(THREAT_BAND_UPPER.warn + 1)).toBe("danger");
    expect(threatTone(100)).toBe("danger");
  });

  it("judges the band on the rounded value the readout shows (#368)", () => {
    expect(threatTone(33.4)).toBe("ok");
    expect(threatTone(33.5)).toBe("warn");
    expect(threatTone(66.4)).toBe("warn");
    expect(threatTone(66.5)).toBe("danger");
    expect(threatTone(32.6)).toBe("ok");
  });

  it("agrees with formatWhole across the whole scale", () => {
    for (let raw = 0; raw <= 100; raw += 0.1) {
      const shown = Number(formatWhole(raw));
      const expected =
        shown <= THREAT_BAND_UPPER.ok
          ? "ok"
          : shown <= THREAT_BAND_UPPER.warn
            ? "warn"
            : "danger";
      expect(threatTone(raw), String(raw)).toBe(expected);
    }
  });
});
