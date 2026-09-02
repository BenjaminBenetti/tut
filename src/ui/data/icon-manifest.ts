/**
 * UI icon registry (style guide §5, §9). Every icon is a 24×24 single-colour
 * stroke SVG under `public/assets/ui/icons/`, built by
 * `tools/art/build-icons.mjs`. Screens reference icons by `IconId` and
 * render them through the `.tut-icon` mask class in `src/ui/style/theme.css`,
 * never by a path string literal (architecture §7).
 */

// ===========================================
// Types
// ===========================================

/** One registered icon asset. */
export interface IconAssetEntry {
  /** Path under `public/`, e.g. `assets/ui/icons/mech.svg`. */
  readonly path: string;
  /** Accessible label for the icon's meaning. */
  readonly label: string;
}

// ===========================================
// Manifest
// ===========================================

/** Every UI icon, keyed by id. */
export const ICON_MANIFEST = {
  ability: { path: "assets/ui/icons/ability.svg", label: "Ability" },
  advance: { path: "assets/ui/icons/advance.svg", label: "Advance day" },
  attack: { path: "assets/ui/icons/attack.svg", label: "Attack" },
  back: { path: "assets/ui/icons/back.svg", label: "Back" },
  check: { path: "assets/ui/icons/check.svg", label: "Confirm" },
  city: { path: "assets/ui/icons/city.svg", label: "City" },
  close: { path: "assets/ui/icons/close.svg", label: "Close" },
  credits: { path: "assets/ui/icons/credits.svg", label: "Credits" },
  day: { path: "assets/ui/icons/day.svg", label: "Day" },
  deploy: { path: "assets/ui/icons/deploy.svg", label: "Deploy" },
  egg: { path: "assets/ui/icons/egg.svg", label: "Egg spawner" },
  extract: { path: "assets/ui/icons/extract.svg", label: "Extract" },
  infestation: {
    path: "assets/ui/icons/infestation.svg",
    label: "Infestation",
  },
  info: { path: "assets/ui/icons/info.svg", label: "Info" },
  lock: { path: "assets/ui/icons/lock.svg", label: "Locked" },
  mech: { path: "assets/ui/icons/mech.svg", label: "Mech" },
  mission: { path: "assets/ui/icons/mission.svg", label: "Mission" },
  move: { path: "assets/ui/icons/move.svg", label: "Move" },
  overwatch: { path: "assets/ui/icons/overwatch.svg", label: "Overwatch" },
  region: { path: "assets/ui/icons/region.svg", label: "Region" },
  reload: { path: "assets/ui/icons/reload.svg", label: "Reload / vent" },
  squad: { path: "assets/ui/icons/squad.svg", label: "Infantry squad" },
  threat: { path: "assets/ui/icons/threat.svg", label: "Global threat" },
  warning: { path: "assets/ui/icons/warning.svg", label: "Warning" },
  "marker-city": {
    path: "assets/ui/icons/marker-city.svg",
    label: "City marker",
  },
  "marker-hive": {
    path: "assets/ui/icons/marker-hive.svg",
    label: "Hive marker",
  },
  "infestation-low": {
    path: "assets/ui/icons/infestation-low.svg",
    label: "Infestation: low",
  },
  "infestation-mid": {
    path: "assets/ui/icons/infestation-mid.svg",
    label: "Infestation: medium",
  },
  "infestation-high": {
    path: "assets/ui/icons/infestation-high.svg",
    label: "Infestation: high",
  },
} as const satisfies Record<string, IconAssetEntry>;

/** Union of registered icon ids. */
export type IconId = keyof typeof ICON_MANIFEST;

/**
 * Resolves an icon id to its public URL for use as a CSS mask. Prefixes
 * Vite's `BASE_URL` so a sub-path deploy still finds the asset.
 * @param id - Registered icon id.
 * @returns A `url(...)` value for the `--icon` custom property.
 */
export function iconUrl(id: IconId): string {
  return `url(${import.meta.env.BASE_URL}${ICON_MANIFEST[id].path})`;
}
