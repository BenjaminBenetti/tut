import type { Command } from "../../core/model/command";
import type { JevActionCommand, JevEntityControl } from "./jev-control";

export const CONFIGURE_JEV = "tactical:configure-jev";
export const JEV_ACT = "tactical:jev-act";
export const DEFAULT_BUG_ACT = "tactical:default-bug-act";

export type ConfigureJevCommand = Command<
  typeof CONFIGURE_JEV,
  {
    readonly unitId: string;
    readonly control: JevEntityControl;
    readonly commanderPrompt: string;
  }
>;
export type JevActCommand = Command<
  typeof JEV_ACT,
  {
    readonly unitId: string;
    readonly expectedSeq: number;
    readonly choice: string;
    readonly command?: JevActionCommand;
  }
>;
export type DefaultBugActCommand = Command<
  typeof DEFAULT_BUG_ACT,
  { readonly unitId: string; readonly expectedSeq: number }
>;

/** Set mission-local control and prompts through the save/command pipeline. */
export function configureJev(
  unitId: string,
  control: JevEntityControl,
  commanderPrompt: string,
): ConfigureJevCommand {
  return { type: CONFIGURE_JEV, payload: { unitId, control, commanderPrompt } };
}
/** Apply one selected action, or finish this activation when no command was selected. */
export function jevAct(payload: JevActCommand["payload"]): JevActCommand {
  return { type: JEV_ACT, payload };
}
/** Run one existing species behaviour inside a mixed bug phase. */
export function defaultBugAct(
  unitId: string,
  expectedSeq: number,
): DefaultBugActCommand {
  return { type: DEFAULT_BUG_ACT, payload: { unitId, expectedSeq } };
}

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [CONFIGURE_JEV]: ConfigureJevCommand;
    [JEV_ACT]: JevActCommand;
    [DEFAULT_BUG_ACT]: DefaultBugActCommand;
  }
}
declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [CONFIGURE_JEV]: ConfigureJevCommand;
    [JEV_ACT]: JevActCommand;
    [DEFAULT_BUG_ACT]: DefaultBugActCommand;
  }
}
