/**
 * A request from presentation to change simulation state. Commands are
 * plain data so they can be logged, replayed, and tested. Each domain
 * declares its own union of concrete command types.
 */
export interface Command<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly payload: TPayload;
}
