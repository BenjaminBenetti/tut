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
