/** Executive Director's one-line mist-strength control, shared by air and surfaces. */
export const UNEXPLORED_FOG_STRENGTH = 0.075;

/** Approved sheet heights above each level, in world units. */
export const UNEXPLORED_FOG_LAYERS = [0.18, 0.52, 0.9] as const;

/** Approved mist colour, before tone mapping and output colour conversion. */
export const UNEXPLORED_FOG_COLOUR = 0xb6c1c4;
