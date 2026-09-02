/** Why a load failed. Serializable so UI can show it and tests can match on it. */
export interface SaveError {
  readonly kind:
    | "missing"
    | "parse"
    | "malformed"
    | "unsupported-version"
    | "migration-failed"
    | "storage";
  readonly message: string;
}
