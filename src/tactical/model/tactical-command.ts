// ===========================================
// Tactical command map
// ===========================================
//
// The union of tactical commands is *derived* from `TacticalCommandMap`,
// and each command module registers itself from its own file (#246). The
// same modules also register into the campaign's `OverworldCommandMap`,
// because tactical commands run on the one campaign dispatcher (Tech Lead
// ruling on #324): there is no second store.
//
// To add a command: create `tactical/model/<name>-command.ts` with the
// `tactical:` tag, payload, command type, builder and two augmentations:
//
// ```
//   declare module "./tactical-command" {
//     interface TacticalCommandMap { [TAG]: XCommand }
//   }
//   declare module "../../overworld/model/overworld-command" {
//     interface OverworldCommandMap { [TAG]: XCommand }
//   }
// ```

/**
 * Registry of every tactical command, keyed by its `type` tag. Empty here
 * by design: command modules augment it. Must stay an `interface`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by each command module
export interface TacticalCommandMap {}

// ===========================================
// Derived unions
// ===========================================

/** Every command the tactical rules accept. Derived from the map. */
export type TacticalCommand = TacticalCommandMap[keyof TacticalCommandMap];

/** The `type` tag of a `TacticalCommand`. */
export type TacticalCommandType = keyof TacticalCommandMap;

/** The member of `TacticalCommand` with the given `type` tag. */
export type TacticalCommandFor<TType extends TacticalCommandType> =
  TacticalCommandMap[TType];
