/** Ecological layout, growth and damage scales for the infestation generator. */
export interface InfestationTuning {
  readonly columnsPerColony: number;
  readonly minimumColonySpacing: number;
  readonly baseRadius: number;
  readonly radiusPerLevel: number;
  readonly baseClearingRadius: number;
  readonly clearingRadiusPerLevel: number;
  readonly growthThreshold: number;
  readonly corridorWidth: number;
  readonly noiseFrequency: number;
  readonly hookClearance: number;
  readonly propsPerGrowthTile: number;
}
