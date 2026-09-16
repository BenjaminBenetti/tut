import type { BusinessFrontageKind } from "./building-frontage-style";

/** A presentation-only business name, shared by every wide entrance on one building. */
export interface BusinessSignAppearance {
  readonly kind: BusinessFrontageKind;
  /** Index into the trade's authored name catalogue and matching printed atlas. */
  readonly nameIndex: number;
}

/** The authored names available to each trade, in atlas order. */
export type BusinessNameCatalogue = Readonly<
  Record<BusinessFrontageKind, readonly string[]>
>;
