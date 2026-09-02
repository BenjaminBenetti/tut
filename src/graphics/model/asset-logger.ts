/**
 * Where asset services report recoverable problems, such as a model that
 * fell back to a placeholder. `console` satisfies it; tests inject a spy.
 */
export interface AssetLogger {
  /** Reports a problem the app survived. */
  warn(message: string): void;
}
