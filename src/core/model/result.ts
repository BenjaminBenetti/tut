/**
 * Discriminated success/failure value. Simulation services return
 * `Result` instead of throwing so callers handle invalid commands
 * explicitly and the failure reason stays serializable.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/** Successful outcome carrying a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed outcome carrying an error value. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Wraps a value as a successful result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Wraps an error as a failed result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
