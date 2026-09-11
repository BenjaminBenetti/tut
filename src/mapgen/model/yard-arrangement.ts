import type { PropKindId } from "./prop";

/** A small outdoor use, paid for by the existing yard-prop allocation. */
export interface YardArrangement {
  readonly prop: PropKindId;
  /** A single group per building; omit the group when it cannot fit. */
  readonly count: number;
  /** Tile spacing along the supporting building wall. */
  readonly spacing: number;
  /** Seating favors the entrance; delivery/storage favors a side/rear wall. */
  readonly frontage: boolean;
}
