import { describe, expect, it } from "vitest";

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
});
