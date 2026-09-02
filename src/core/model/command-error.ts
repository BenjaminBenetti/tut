/**
 * Why a command was rejected. Plain data so it can be logged, shown in
 * the UI, or serialized into a replay alongside the command. Codes are
 * domain-defined strings such as `"unknown-command"` or
 * `"insufficient-credits"`; the message is for humans.
 */
export interface CommandError<TCode extends string = string> {
  readonly code: TCode;
  readonly message: string;
}

/** Builds a command error. */
export function commandError<TCode extends string>(
  code: TCode,
  message: string,
): CommandError<TCode> {
  return { code, message };
}
