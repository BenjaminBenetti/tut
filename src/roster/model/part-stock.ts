import type { PartId } from "./mech-part";

// ===========================================
// Part stock
// ===========================================

/**
 * Loose parts the force owns, counted by part id (arc §6.6): what a won
 * Wreck Recovery carried home. A build draws on it before it pays, so a
 * stocked part is fitted free. A part not listed, or listed at `0`, is
 * not in stock. Plain serializable data.
 *
 * ```
 *   { "arm-autocannon": 1, "legs-strider": 1, "util-radar": 2 }
 * ```
 */
export type PartStock = Readonly<Record<PartId, number>>;

/** A stock with nothing in it. */
export const EMPTY_PART_STOCK: PartStock = {};
