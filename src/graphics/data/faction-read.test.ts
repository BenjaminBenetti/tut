import { describe, expect, it } from "vitest";

// ===========================================
// Palette
// ===========================================

/**
 * Style guide §4.1 / §4.2: the faction colours that cover most of a
 * model's visible surface — infantry uniform, mech armour, bug body.
 *
 * Only these. Markings and glow are small by rule, so they cannot be
 * what makes a unit read. Nor can joints and weapon bodies: `tdf-grey-dark`
 * sits at ΔE 6.4 from asphalt, as close as the collision this file exists
 * for, and it matters not at all, because nothing that small can lose a
 * silhouette. A colour is only dangerous over area.
 */
const FACTION_PRIMARIES: Readonly<Record<string, string>> = {
  "tdf-olive": "#6B7A3F",
  "tdf-olive-dark": "#45502A",
  "tdf-grey-mid": "#5B6573",
  "bug-chitin-dark": "#2B2436",
};

/** Style guide §4.3: every surface a unit can stand on. */
const GROUND_TOKENS: Readonly<Record<string, string>> = {
  "env-asphalt": "#3A3D42",
  "env-concrete": "#8E8A82",
  "env-sidewalk": "#A7A297",
  "env-roof": "#55524C",
  "env-rock": "#6E6A66",
  "env-grass": "#5E7A3A",
  "env-dirt": "#7A6045",
  "env-snow": "#E8ECF0",
  "env-ice": "#B9D2E0",
  "env-frozen-dirt": "#6B6A66",
  "env-sand": "#D9B87A",
  "env-sandstone": "#B58A5A",
  "env-scrub": "#8A8A4A",
  "env-wet-sand": "#B5A276",
  "env-water-shallow": "#3F8FA8",
  "env-seawall": "#7E7F7A",
};

/**
 * Below this, two colours are close enough that a small, near-monotone
 * model standing on that ground loses its silhouette (§4.2.1). It is a
 * screen, not a verdict: a large model with strong internal contrast
 * survives a much closer match, which is why the render is still the
 * thing that decides.
 */
const MIN_SEPARATION = 12;

/**
 * Pairs already known to be too close, each with the reason it is not
 * simply fixed. New entries do not belong here — a collision this test
 * catches is a collision to design out, not to record.
 *
 * `tdf-olive` / `env-grass` is the severe one (#613): ΔE 6.2 with no
 * tonal separation at all, on the temperate biome's primary ground.
 * The other two are the same olive against desert scrub and mech armour
 * against frozen dirt.
 *
 * None of them is fixed by picking a better hue — every hue is
 * somebody's ground — so the answers are contact shadows (#507) and
 * internal contrast, per §4.2.1.
 */
const KNOWN_COLLISIONS: readonly string[] = [
  "tdf-olive/env-grass", // ΔE 6.2 — the severe one
  "tdf-olive/env-scrub", // ΔE 10.2
  "tdf-grey-mid/env-frozen-dirt", // ΔE 11.8
];

// ===========================================
// Helpers
// ===========================================

/** CIE L*a*b* for an sRGB hex, D65 white. */
function lab(hex: string): readonly [number, number, number] {
  const channel = (offset: number): number => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 colour difference. */
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ===========================================
// Tests
// ===========================================

describe("faction read against ground", () => {
  it("finds no separation failure that is not already known", () => {
    const failures: string[] = [];
    for (const [unit, unitHex] of Object.entries(FACTION_PRIMARIES)) {
      for (const [ground, groundHex] of Object.entries(GROUND_TOKENS)) {
        const pair = `${unit}/${ground}`;
        if (
          deltaE(unitHex, groundHex) < MIN_SEPARATION &&
          !KNOWN_COLLISIONS.includes(pair)
        ) {
          failures.push(pair);
        }
      }
    }
    // A new name here means a palette change has put a faction colour on
    // top of a ground colour. Run the three read tests in §4.2.1 before
    // deciding what to do about it.
    expect(failures).toEqual([]);
  });

  it("keeps the known collisions honest, so a fix is noticed", () => {
    // If one of these clears the threshold it has been designed out and
    // should leave the list — otherwise the list rots into a licence.
    const stillColliding = KNOWN_COLLISIONS.filter((pair) => {
      const [unit, ground] = pair.split("/");
      return (
        deltaE(FACTION_PRIMARIES[unit!]!, GROUND_TOKENS[ground!]!) <
        MIN_SEPARATION
      );
    });
    expect(stillColliding).toEqual(KNOWN_COLLISIONS);
  });

  it("pins the worst pair in the game, olive infantry on grass (#613)", () => {
    const separation = deltaE(
      FACTION_PRIMARIES["tdf-olive"]!,
      GROUND_TOKENS["env-grass"]!,
    );
    // ΔE 2.3 is one just-noticeable difference. At 6.2 these are, to the
    // eye, the same colour — and grass is the temperate biome's primary
    // ground, so this is the most common ground in the game.
    expect(separation).toBeLessThan(7);
    const tonal = Math.abs(
      lab(FACTION_PRIMARIES["tdf-olive"]!)[0] -
        lab(GROUND_TOKENS["env-grass"]!)[0],
    );
    expect(tonal).toBeLessThan(2);
  });
});
