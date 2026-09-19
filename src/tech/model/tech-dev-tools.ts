// ===========================================
// Tech dev tools
// ===========================================

/**
 * The development tools a dev build offers the tech tree (#1171): a
 * button that grants a fixed pool of tech points so a tester can walk
 * the tree without playing missions. Present only when the composition
 * was told this is a dev build; a production build gets `undefined`,
 * renders nothing of it and refuses the command behind it.
 */
export interface TechDevTools {
  /** How many tech points one press of the button grants. */
  readonly grantPoints: number;
}
