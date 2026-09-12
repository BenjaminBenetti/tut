/**
 * Half-height layers per building storey (ADR 0008). A layer is an integer
 * vertical coordinate; floors, walls and manufactured connectors span two.
 */
export const STOREY_LAYERS = 2;

/**
 * Height of one layer measured in tile widths (ADR 0008 §2.1: a tile is
 * one world unit, a layer 0.75 of it). The one place the vertical and
 * the horizontal scales meet, so a rule that mixes them (attack
 * distance, #1119) and the renderer that draws them agree.
 */
export const LAYER_TILES = 0.75;
