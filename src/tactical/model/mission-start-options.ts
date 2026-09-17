// ===========================================
// Mission start options
// ===========================================

/**
 * What the launch knows about a mission beyond the deployment (#1155):
 * the region's standing defences. Every field is optional so a launch
 * that knows nothing starts the mission as it always did. A model
 * rather than a service type because the `MissionStarter` port and the
 * `StartMission` handler both name it.
 */
export interface MissionStartOptions {
  /**
   * How many garrison turrets the region's defensive batteries stand on
   * the map when the mission opens (#1155): the overworld's
   * `computeModifiers().garrisonTurrets[regionId]` at launch. Each is
   * an ordinary turret on the player's side with no battery, spread
   * over the map by `placeGarrisonTurrets`. Absent or zero stands none.
   */
  readonly garrisonTurrets?: number;
}
