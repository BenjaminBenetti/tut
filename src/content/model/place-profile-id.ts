/** Optional local identities; omitted in legacy recipes and unnamed sites. */
export const PLACE_PROFILE_IDS = ["lagos", "perth", "johannesburg"] as const;

/** Shared by mission adaptation, map generation and graphics. */
export type PlaceProfileId = (typeof PLACE_PROFILE_IDS)[number];

/** Recognises a supported city profile without changing any other city. */
export function isPlaceProfileId(
  value: string | null,
): value is PlaceProfileId {
  return PLACE_PROFILE_IDS.some((id) => id === value);
}
