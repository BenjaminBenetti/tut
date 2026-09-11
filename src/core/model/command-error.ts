/**
 * Why a command was rejected. Plain data so it can be logged, shown in
 * the UI, or serialized into a replay alongside the command. Codes are
 * domain-defined strings such as `"unknown-command"` or
 * `"insufficient-credits"`; the message is for humans.
 *
 * `cause` is the domain's own typed refusal, carried through the
 * dispatch boundary rather than flattened into `message` (#1035). Core
 * never learns what any domain's refusal looks like -- the type comes
 * from the caller, so `tactical` can put a `TacticalError` here without
 * `core` importing `tactical`:
 *
 * ```
 *   tactical ──► CommandError<TacticalErrorKind, TacticalError>
 *                          │  assignable to
 *                          ▼
 *   core/ui  ──► CommandError<string, unknown>   ← knows only "some cause"
 * ```
 *
 * It is optional and defaults to `unknown`, so every error built before
 * this existed still satisfies the type and every reader of `code` or
 * `message` is unaffected. A consumer that wants the typed value asks
 * the owning domain to narrow it; nobody is required to look.
 */
export interface CommandError<TCode extends string = string, TCause = unknown> {
  readonly code: TCode;
  readonly message: string;
  readonly cause?: TCause;
}

/**
 * Builds a command error, optionally carrying the domain's typed refusal
 * as `cause`.
 */
export function commandError<TCode extends string, TCause = never>(
  code: TCode,
  message: string,
  cause?: TCause,
): CommandError<TCode, TCause> {
  return cause === undefined ? { code, message } : { code, message, cause };
}
