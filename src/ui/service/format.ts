// ===========================================
// Number formatting (style guide §5)
// ===========================================

/** Credits with the `¢` prefix and thousands separators: `¢5,000`. */
export function formatCredits(credits: number): string {
  return `¢${Math.round(credits).toLocaleString("en-US")}`;
}

/**
 * Tech points as a whole number with the short unit: `42 TP` (#1171).
 * No prefix glyph: credits are money and get `¢`; tech points are a
 * count and read as one.
 */
export function formatTechPoints(points: number): string {
  return `${Math.round(points).toLocaleString("en-US")} TP`;
}

/** A whole-number readout for gauges such as threat: `42`. */
export function formatWhole(value: number): string {
  return String(Math.round(value));
}

/**
 * A population at a glance: `37M`, `9.7M`, `640K`, `2.5K`, `850`. One
 * decimal at most and none when it would be `.0`, so the figure reads
 * as an order of magnitude rather than a census (#1154).
 */
export function formatPopulation(people: number): string {
  const rounded = Math.max(0, Math.round(people));
  if (rounded >= 1_000_000) {
    return `${trimDecimal(rounded / 1_000_000)}M`;
  }
  if (rounded >= 1_000) {
    return `${trimDecimal(rounded / 1_000)}K`;
  }
  return String(rounded);
}

// ===========================================
// Line breaking
// ===========================================

/** U+00A0: a space a wrapping line never breaks at. */
export const NO_BREAK_SPACE = "\u00a0";

/**
 * `text` with every space made a no-break space, so a short phrase
 * such as a count and its noun ("1 trapped", "1 / 4 aboard") stays on
 * one line when the line it sits in wraps.
 */
export function keepTogether(text: string): string {
  return text.replaceAll(" ", NO_BREAK_SPACE);
}

// ===========================================
// Helpers
// ===========================================

/** One decimal place, dropped when it is zero: `9.7`, `37`. */
function trimDecimal(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}
