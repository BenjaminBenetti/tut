/** Relative likelihood of civilian and defensive street furniture. */
export interface StreetPropTuning {
  readonly weights: Readonly<Record<string, number>>;
  readonly defaultWeight: number;
}
