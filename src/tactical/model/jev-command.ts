import type { Command } from "../../core/model/command";
import type { JevActionCommand, JevEntityControl } from "./jev-control";
import type { Team } from "./unit";

export const CONFIGURE_JEV = "tactical:configure-jev";
export const SET_JEV_COMMANDER_PROMPT = "tactical:set-jev-commander-prompt";
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
/** Change faction orders independently of any entity's control or AP. */
export type SetJevCommanderPromptCommand = Command<
  typeof SET_JEV_COMMANDER_PROMPT,
  { readonly team: Team; readonly prompt: string }
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
/** Set shared faction orders through the same saved command pipeline as entity configuration. */
export function setJevCommanderPrompt(
  team: Team,
  prompt: string,
): SetJevCommanderPromptCommand {
  return { type: SET_JEV_COMMANDER_PROMPT, payload: { team, prompt } };
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
    [SET_JEV_COMMANDER_PROMPT]: SetJevCommanderPromptCommand;
    [JEV_ACT]: JevActCommand;
    [DEFAULT_BUG_ACT]: DefaultBugActCommand;
  }
}
declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [CONFIGURE_JEV]: ConfigureJevCommand;
    [SET_JEV_COMMANDER_PROMPT]: SetJevCommanderPromptCommand;
    [JEV_ACT]: JevActCommand;
    [DEFAULT_BUG_ACT]: DefaultBugActCommand;
  }
}
