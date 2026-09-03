import type { Vec2 } from "../../core/model/grid";
import type { CityMarkerLookReport } from "../../graphics/view/city-marker";
import type { CityId } from "../../overworld/model/city";

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
  /** What a city's marker currently shows: tint and mission badge. */
  cityMarkerLook(cityId: CityId): CityMarkerLookReport | undefined;
}

declare global {
  interface Window {
    __tut__?: TutTestHooks;
  }
}
