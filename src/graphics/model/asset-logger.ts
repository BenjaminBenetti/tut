/**
 * Prefix on every asset fallback warning. The end-to-end smoke test fails
 * on any console warning carrying it, so a broken asset path cannot slip
 * through even though the app itself keeps running on a stand-in.
 */
export const ASSET_WARNING_PREFIX = "[assets]";

/**
 * Where asset services report recoverable problems, such as a model that
 * fell back to a placeholder. `console` satisfies it; tests inject a spy.
 */
export interface AssetLogger {
  /** Reports a problem the app survived. */
  warn(message: string): void;
}
