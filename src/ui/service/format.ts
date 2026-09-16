// ===========================================
// Number formatting (style guide §5)
// ===========================================

/** Credits with the `¢` prefix and thousands separators: `¢5,000`. */
export function formatCredits(credits: number): string {
  return `¢${Math.round(credits).toLocaleString("en-US")}`;
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

/** One decimal place, dropped when it is zero: `9.7`, `37`. */
function trimDecimal(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}
