import { describe, expect, it } from "vitest";
import { constructionOf } from "./construction-service";

describe("constructionOf", () => {
  it("follows the kind when the template says nothing", () => {
    expect(constructionOf({}, "mech")).toBe("mechanical");
    expect(constructionOf({}, "squad")).toBe("organic");
    expect(constructionOf({}, "bug")).toBe("organic");
  });

  it("lets a template overrule its kind", () => {
    expect(constructionOf({ construction: "mechanical" }, "squad")).toBe(
      "mechanical",
    );
    expect(constructionOf({ construction: "organic" }, "mech")).toBe("organic");
  });
});
