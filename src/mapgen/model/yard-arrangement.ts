import type { PropKindId } from "./prop";

/** A small outdoor use, paid for by the existing yard-prop allocation. */
export interface YardArrangement {
  /** Ordered low-cover pieces; omit a group when the complete use cannot fit. */
  readonly props: readonly PropKindId[];
  /** Tile spacing along the supporting building wall. */
  readonly spacing: number;
  /** Seating favors the entrance; delivery/storage favors a side/rear wall. */
  readonly frontage: boolean;
}
