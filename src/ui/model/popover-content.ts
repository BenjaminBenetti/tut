// ===========================================
// Popover content
// ===========================================

/**
 * How one line of a popover is set: `body` for what a thing does,
 * `dim` for costs and caps, `heading` to open a block such as the next
 * level, `warn` for why something cannot be done.
 */
export type PopoverLineKind = "body" | "dim" | "heading" | "warn";

/** One line of a popover. */
export interface PopoverLine {
  readonly text: string;
  readonly kind: PopoverLineKind;
}

/**
 * What a `PopoverView` shows (#1155): a title and lines under it. Plain
 * data, built by a pure service so the view knows nothing about what
 * it is describing.
 */
export interface PopoverContent {
  readonly title: string;
  readonly lines: readonly PopoverLine[];
}
