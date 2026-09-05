#!/usr/bin/env node
/**
 * Builds the UI icon set: 24×24 single-colour stroke SVGs under
 * `public/assets/ui/icons/` (style guide §5). Deterministic: icons are path
 * data in this file, so re-running reproduces identical output.
 *
 *   node tools/art/build-icons.mjs
 *
 * Icons draw with `currentColor` and no fill so the `.tut-icon` mask class in
 * `src/ui/style/theme.css` can tint them with any token.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ===========================================
// Icon definitions
// ===========================================

/**
 * Icon id → SVG inner markup. Keep strokes on the 2 px grid, square caps,
 * mitre joins, no curves where a straight line reads as well.
 * @type {Record<string, string>}
 */
const ICONS = {
  advance: '<path d="M5 4 L15 12 L5 20 Z"/><path d="M19 4 V20"/>',
  day: '<circle cx="12" cy="12" r="9"/><path d="M12 7 V12 H16"/>',
  credits:
    '<path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z"/><path d="M15 9 H11 A3 3 0 0 0 11 15 H15"/><path d="M12 6 V9 M12 15 V18"/>',
  threat:
    '<circle cx="12" cy="12" r="9"/><path d="M12 12 V3 M12 12 L4.2 16.5 M12 12 L19.8 16.5"/><circle cx="12" cy="12" r="2"/>',
  city: '<path d="M2 21 H22"/><path d="M4 21 V9 H10 V21"/><path d="M10 15 H15 V21"/><path d="M15 21 V4 H20 V21"/><path d="M6 12 H8 M6 16 H8 M17 8 H18 M17 12 H18 M17 16 H18"/>',
  region:
    '<path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z"/><circle cx="12" cy="12" r="2"/>',
  mission:
    '<circle cx="12" cy="12" r="7"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22"/>',
  squad:
    '<circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 10 V16 M12 10 V16 M18 10 V16"/><path d="M3 21 L6 16 L9 21 M9 21 L12 16 L15 21 M15 21 L18 16 L21 21"/>',
  mech: '<path d="M10 3 H14 V6"/><path d="M9 6 H15 V14 H9 Z"/><path d="M5 8 H9 M15 8 H19"/><path d="M5 8 V13 M19 8 V13"/><path d="M8 14 V21 H10 V17 H14 V21 H16 V14"/>',
  deploy:
    '<path d="M8 3 H4 V21 H8 M16 3 H20 V21 H16"/><path d="M12 6 V17 M8 13 L12 17 L16 13"/>',
  extract:
    '<path d="M8 3 H4 V21 H8 M16 3 H20 V21 H16"/><path d="M12 18 V7 M8 11 L12 7 L16 11"/>',
  move: '<path d="M12 2 V22 M2 12 H22"/><path d="M9 5 L12 2 L15 5 M9 19 L12 22 L15 19 M5 9 L2 12 L5 15 M19 9 L22 12 L19 15"/>',
  attack:
    '<circle cx="12" cy="12" r="8"/><path d="M12 1 V6 M12 18 V23 M1 12 H6 M18 12 H23"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  overwatch:
    '<path d="M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z"/><circle cx="12" cy="12" r="3"/>',
  reload: '<path d="M20 12 A8 8 0 1 1 14.3 4.4"/><path d="M14 1 V5 H18"/>',
  ability: '<path d="M13 2 L5 13 H11 L10 22 L19 10 H13 Z"/>',
  infestation:
    '<circle cx="12" cy="14" r="5"/><path d="M12 9 V19"/><path d="M9 5 L12 8 L15 5"/><path d="M7 12 L3 9 M7 15 H3 M7 18 L3 21 M17 12 L21 9 M17 15 H21 M17 18 L21 21"/>',
  egg: '<path d="M12 2 C7 8 5 12 5 16 A7 7 0 0 0 19 16 C19 12 17 8 12 2 Z"/>',
  warning:
    '<path d="M12 3 L22 20 H2 Z"/><path d="M12 10 V14"/><path d="M12 17 V17.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11 V17"/><path d="M12 7.5 V8"/>',
  check: '<path d="M4 12 L10 18 L20 6"/>',
  close: '<path d="M5 5 L19 19 M19 5 L5 19"/>',
  back: '<path d="M15 4 L7 12 L15 20"/>',
  lock: '<path d="M5 11 H19 V21 H5 Z"/><path d="M8 11 V7 A4 4 0 0 1 16 7 V11"/>',
  // Overworld map glyphs (#143). Markers point at their tile with a stem.
  "marker-city":
    '<path d="M12 2 L20 6.5 V15.5 L12 20 L4 15.5 V6.5 Z"/><path d="M12 20 V23"/><path d="M8 14 V10 H11 V14 M13 14 V8 H16 V14"/>',
  "marker-hive":
    '<path d="M12 2 L20 6.5 V15.5 L12 20 L4 15.5 V6.5 Z"/><path d="M12 20 V23"/><circle cx="12" cy="11" r="3"/><path d="M12 5 V8 M12 14 V17 M7 8 L9.5 9.5 M17 8 L14.5 9.5 M7 14 L9.5 12.5 M17 14 L14.5 12.5"/>',
  "infestation-low": '<path d="M3 21 H21"/><path d="M5 21 V15 H9 V21"/>',
  "infestation-mid":
    '<path d="M3 21 H21"/><path d="M5 21 V15 H9 V21"/><path d="M10 21 V10 H14 V21"/>',
  "infestation-high":
    '<path d="M3 21 H21"/><path d="M5 21 V15 H9 V21"/><path d="M10 21 V10 H14 V21"/><path d="M15 21 V4 H19 V21"/>',
  // Tactical HUD, round 2 (#466). Stats and states the mission HUD shows as
  // bare text today; same 2 px grid, square caps, no curves where a straight
  // line reads as well.
  "end-turn":
    '<path d="M4 5 L12 12 L4 19 Z"/><path d="M11 5 L19 12 L11 19 Z"/><path d="M21 4 V20"/>',
  interact: '<path d="M12 3 V11"/><path d="M6.6 6.2 A7.5 7.5 0 1 0 17.4 6.2"/>',
  hidden:
    '<path d="M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 L20 4"/>',
  suppressed:
    '<path d="M6 3 L12 8 L18 3"/><path d="M6 9 L12 14 L18 9"/><path d="M4 19 H20"/>',
  hp: '<path d="M2 12 H7 L10 5 L14 19 L17 12 H22"/>',
  ap: '<circle cx="5" cy="12" r="2.6" fill="currentColor"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><circle cx="19" cy="12" r="2.6"/>',
  armor:
    '<path d="M12 2 L20 6 V12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 V6 Z"/><path d="M12 7 V16"/>',
  damage:
    '<path d="M12 2 L15 9.5 L22 12 L15 14.5 L12 22 L9 14.5 L2 12 L9 9.5 Z"/>',
  range:
    '<path d="M3 12 H21"/><path d="M3 7 V17"/><path d="M21 7 V17"/><path d="M9 9 L12 12 L9 15"/>',
  "cover-low":
    '<path d="M2 21 H22"/><path d="M5 21 V14 H19 V21"/><circle cx="12" cy="9" r="2.5"/>',
  "cover-high":
    '<path d="M2 21 H22"/><path d="M5 21 V4 H19 V21"/><path d="M9 10 H15"/>',
  elevation:
    '<path d="M2 20 H8 V15 H14 V10 H20 V5"/><path d="M17 8 L20 5 L23 8"/>',
  ammo: '<path d="M9 3 H15 V7 H9 Z"/><path d="M7 7 H17 V21 H7 Z"/><path d="M10 11 H14 M10 15 H14"/>',
  // Mech bay stat sheet (#673). Each avoids a shape the set already
  // spends: `attack` and `mission` are both crosshairs, so accuracy is a
  // bullseye with an arrow landing in it; `damage` is a hit (the star)
  // and `ammo` a square-nubbed magazine, so firepower is an ogive shell
  // -- what a mech throws, not what it lands; heat is the flame that
  // `reload` ("Reload / vent") answers; weight is a kettlebell.
  accuracy:
    '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="3"/><path d="M22 2 L13 11"/><path d="M13 7 V11 H17"/>',
  firepower:
    '<path d="M12 2 C15 5 16 8 16 12 V18 H8 V12 C8 8 9 5 12 2 Z"/><path d="M5 21 H19"/>',
  heat: '<path d="M12 2 C16 7 18 10 18 15 A6 6 0 0 1 6 15 C6 10 8 7 12 2 Z"/><path d="M12 11 C14 13 15 14 15 16.5 A3 3 0 0 1 9 16.5 C9 14 10 13 12 11 Z"/>',
  weight:
    '<path d="M9 8 V7 A3 3 0 0 1 15 7 V8"/><path d="M5 8 H19 L21 21 H3 Z"/>',
};

// ===========================================
// Build
// ===========================================

/**
 * Wraps icon markup in the shared SVG envelope.
 * @param {string} inner - Path markup.
 * @returns {string} Complete SVG document.
 */
function wrap(inner) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" ' +
    `stroke-linejoin="miter">${inner}</svg>\n`
  );
}

/**
 * Entry point: writes one SVG per icon and prints sizes.
 */
function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, "..", "..", "public", "assets", "ui", "icons");
  mkdirSync(outDir, { recursive: true });
  for (const [id, inner] of Object.entries(ICONS)) {
    const svg = wrap(inner);
    writeFileSync(join(outDir, `${id}.svg`), svg);
    console.log(`${id.padEnd(14)} ${String(svg.length).padStart(4)} B`);
  }
  console.log(`\n${Object.keys(ICONS).length} icons → ${outDir}`);
}

main();
