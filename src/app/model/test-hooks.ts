import type { Vec2 } from "../../core/model/grid";
import type { CityMarkerLookReport } from "../../graphics/view/city-marker";
import type { InstallationLookReport } from "../../graphics/view/installation-marker";
import type { CityId } from "../../overworld/model/city";
import type { DeployableId } from "../../overworld/model/deployable";

/**
 * Hooks the dev build exposes on `window.__tut__` so end-to-end tests
 * can drive the app without reaching into internals. Never installed
 * in production builds.
 */
export interface TutTestHooks {
  /** Selects a city on the overworld map as if its marker were clicked. */
  selectCity(cityId: CityId): void;
  /** Client-pixel position of a city's marker, for a real pointer click. */
  cityScreenPosition(cityId: CityId): Vec2 | undefined;
  /** What a city's marker currently shows: pad tint, egg cue and which model. */
  cityMarkerLook(cityId: CityId): CityMarkerLookReport | undefined;
  /**
   * Points the map camera at a city and, when given, sets its zoom in
   * pixels per world unit (#1155), for captures that need a settlement
   * larger than the two dozen pixels it gets at the default zoom.
   */
  focusCity(cityId: CityId, zoom?: number): void;
  /** What a built installation currently shows on the map, or `undefined` when none is drawn for the id. */
  installationLook(id: DeployableId): InstallationLookReport | undefined;
  /** Client-pixel position of a built installation, or `undefined` when none is drawn for the id. */
  installationScreenPosition(id: DeployableId): Vec2 | undefined;
  /**
   * Starts the offered mission `missionId` tactically with the whole
   * roster and opens the tactical screen (#342). Returns the error
   * message when it cannot; `LaunchMission` (#341) is the real path.
   */
  startTacticalMission(missionId: string): string | undefined;
}

/**
 * What the tech tree's graph exposes to the Playwright specs in a dev
 * build (#1171): where a node's pedestal is on screen, so a spec can
 * click the model rather than the label, and a way to select or centre
 * a node without finding it first.
 */
export interface TutTechHooks {
  /** CSS pixels from the graph container's top-left, or undefined for an unknown node. */
  nodeScreenPosition(nodeId: string): Vec2 | undefined;
  /** Selects `nodeId` as a click on its pedestal would. */
  select(nodeId: string): void;
  /** Pans the camera onto `nodeId`. */
  focus(nodeId: string): void;
  /** The camera's zoom, in pixels per world unit. */
  zoom(): number;
}

declare global {
  interface Window {
    __tut__?: TutTestHooks;
    __tutTech__?: TutTechHooks;
  }
}
