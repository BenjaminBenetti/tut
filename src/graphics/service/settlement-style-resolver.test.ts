import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { SETTLEMENT_STYLES } from "../data/settlement-styles";
import { SETTLEMENT_STYLE_IDS } from "../model/settlement-style";
import { SettlementStyleResolver } from "./settlement-style-resolver";

describe("SettlementStyleResolver (#1155)", () => {
  it("names a style for every region on the Earth map without touching the fallback", () => {
    const resolver = new SettlementStyleResolver();
    for (const region of EARTH_MAP.regions) {
      expect(SETTLEMENT_STYLES.byRegion[region.id]).toBeDefined();
      expect(SETTLEMENT_STYLE_IDS).toContain(resolver.styleFor(region.id));
    }
  });

  it("keeps Japan, New York, Europe and the Middle East in four different families", () => {
    const resolver = new SettlementStyleResolver();
    const styles = new Set(
      ["east-asia", "north-america-east", "western-europe", "middle-east"].map(
        (id) => resolver.styleFor(id),
      ),
    );
    expect(styles.size).toBe(4);
  });

  it("uses every family at least once", () => {
    const used = new Set(Object.values(SETTLEMENT_STYLES.byRegion));
    for (const style of SETTLEMENT_STYLE_IDS) {
      expect(used.has(style)).toBe(true);
    }
  });

  it("falls back to the catalogue default for a region it does not know", () => {
    const resolver = new SettlementStyleResolver({
      byRegion: { mars: "oceanian" },
      fallback: "slavic",
    });
    expect(resolver.styleFor("mars")).toBe("oceanian");
    expect(resolver.styleFor("venus")).toBe("slavic");
  });
});
