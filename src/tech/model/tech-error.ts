import type { TechNodeId } from "./tech-node";

// ===========================================
// Errors
// ===========================================

/**
 * An unlock named a node that is hidden: a flag it requires is not set
 * yet (ADR 0013 §2.7). Checked before anything else, so a hidden node is
 * refused the same way whatever else is true of it.
 */
export interface TechHiddenError {
  readonly code: "tech-hidden";
  readonly nodeId: TechNodeId;
}

/** An unlock named a node the tree lacks. */
export interface UnknownTechError {
  readonly code: "unknown-tech";
  readonly nodeId: TechNodeId;
}

/** An unlock named a node already bought. */
export interface TechAlreadyUnlockedError {
  readonly code: "tech-already-unlocked";
  readonly nodeId: TechNodeId;
}

/** An unlock named a node whose prerequisites are not all bought. */
export interface TechPrerequisiteLockedError {
  readonly code: "tech-prerequisite-locked";
  readonly nodeId: TechNodeId;
  /** The prerequisites still locked, in the node's own order. */
  readonly missing: readonly TechNodeId[];
}

/** The pool could not cover the node's cost. Mirrors the economy's error. */
export interface TechInsufficientPointsError {
  readonly code: "insufficient-tech-points";
  readonly nodeId: TechNodeId;
  readonly required: number;
  readonly available: number;
}

/**
 * Why a tech command was rejected. Plain data discriminated on `code`
 * so a handler can fold it into a `CommandError` and the tree can say
 * why a card is closed.
 */
export type TechError =
  | TechHiddenError
  | UnknownTechError
  | TechAlreadyUnlockedError
  | TechPrerequisiteLockedError
  | TechInsufficientPointsError;

/** The `code` tag of a `TechError`. */
export type TechErrorCode = TechError["code"];

// ===========================================
// Messages
// ===========================================

/** One human-readable sentence for a tech error, for logs and command errors. */
export function describeTechError(error: TechError): string {
  switch (error.code) {
    case "tech-hidden":
      return `Tech "${error.nodeId}" has not been discovered yet.`;
    case "unknown-tech":
      return `No tech "${error.nodeId}" exists in the tree.`;
    case "tech-already-unlocked":
      return `Tech "${error.nodeId}" is already unlocked.`;
    case "tech-prerequisite-locked":
      return `Tech "${error.nodeId}" needs ${error.missing.join(", ")} first.`;
    case "insufficient-tech-points":
      return `Needs ${error.required} tech points but only ${error.available} are available.`;
  }
}
