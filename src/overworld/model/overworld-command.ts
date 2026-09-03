// ===========================================
// Command map
// ===========================================
//
// The union of commands is *derived* from `OverworldCommandMap`, and each
// command module registers itself from its own file, so adding a command
// never edits a shared line (#246). The dispatcher's `register` is keyed
// by the map, so an unregistered tag is a compile error.
//
// To add a command: create `overworld/model/<name>-command.ts` with the
// constant, payload, command type, builder and
//
// ```
//   declare module "./overworld-command" {
//     interface OverworldCommandMap { [BUILD_DEPLOYABLE]: BuildDeployableCommand }
//   }
// ```
//
// then register a handler at the composition root. Nothing here changes.

/**
 * Registry of every command the overworld dispatcher accepts, keyed by
 * its `type` tag. Empty here by design: command modules augment it.
 * Must stay an `interface` (augmentation cannot extend a type alias).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by each command module
export interface OverworldCommandMap {}

// ===========================================
// Derived unions
// ===========================================

/** Every command the overworld dispatcher accepts. Derived from the map. */
export type OverworldCommand = OverworldCommandMap[keyof OverworldCommandMap];

/** The `type` tag of an `OverworldCommand`. */
export type OverworldCommandType = keyof OverworldCommandMap;

/** The member of `OverworldCommand` with the given `type` tag. */
export type CommandFor<TType extends OverworldCommandType> =
  OverworldCommandMap[TType];

// ===========================================
// Re-exports
// ===========================================
//
// The commands that lived in this file before #246 (`AdvanceDay` and the
// #63 roster commands) are re-exported so existing imports keep compiling
// for one release. Commands added after #246 live only in their own module.

export * from "./advance-day-command";
export * from "./build-mech-command";
export * from "./delete-loadout-command";
export * from "./hire-squad-command";
export * from "./reinforce-squad-command";
export * from "./save-loadout-command";
