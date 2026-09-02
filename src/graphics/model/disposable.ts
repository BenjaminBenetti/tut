/** Anything holding GPU resources that must be released explicitly. */
export interface Disposable {
  /** Frees the underlying resources. */
  dispose(): void;
}
