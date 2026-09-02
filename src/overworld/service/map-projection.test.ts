import { describe, expect, it } from "vitest";

import { projectEquirectangular } from "./map-projection";

describe("projectEquirectangular", () => {
  it("maps the globe's corners to the corners of map space", () => {
    expect(projectEquirectangular(90, -180)).toEqual({ x: 0, y: 0 });
    expect(projectEquirectangular(90, 180)).toEqual({ x: 1, y: 0 });
    expect(projectEquirectangular(-90, -180)).toEqual({ x: 0, y: 1 });
    expect(projectEquirectangular(-90, 180)).toEqual({ x: 1, y: 1 });
  });

  it("maps the equator / prime meridian to the centre", () => {
    expect(projectEquirectangular(0, 0)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("puts north at the top and east on the right", () => {
    const london = projectEquirectangular(51.51, -0.13);
    const nairobi = projectEquirectangular(-1.29, 36.82);
    expect(london.y).toBeLessThan(nairobi.y);
    expect(london.x).toBeLessThan(nairobi.x);
  });

  it("rejects coordinates off the globe", () => {
    expect(() => projectEquirectangular(91, 0)).toThrow(/outside/);
    expect(() => projectEquirectangular(0, -181)).toThrow(/outside/);
    expect(() => projectEquirectangular(Number.NaN, 0)).toThrow(/outside/);
  });
});
