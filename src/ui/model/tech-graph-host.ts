import type { TechNodeId } from "../../tech/model/tech-node";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import type { TechGraphLayout } from "./tech-graph-layout";

// ===========================================
// Types
// ===========================================

/** Where a node or a family plinth sits on the screen, in CSS pixels from the container's top-left. */
export interface TechGraphAnchor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** One frame's worth of anchors, and the zoom they were projected at. */
export interface TechGraphFrame {
  readonly nodes: readonly TechGraphAnchor[];
  readonly families: readonly TechGraphAnchor[];
  /** The camera's zoom in pixels per world unit, so labels can scale with the graph. */
  readonly zoom: number;
}

/** What a graph host tells the screen. */
export interface TechGraphListener {
  /**
   * The camera moved or the canvas was resized: here is where every
   * node and family landed, so the labels can follow them.
   */
  framed(frame: TechGraphFrame): void;
  /** The player clicked a node, or the empty ground (`undefined`). */
  picked(nodeId: TechNodeId | undefined): void;
}

// ===========================================
// TechGraphHost
// ===========================================

/**
 * Lets the tech tree show its graph in three without importing three
 * itself (architecture §3): the app owns the scene, the camera rig, the
 * input and the models; the screen owns the labels, the detail panel
 * and the bar, lays the graph out and decides what each node's status
 * is.
 *
 * ```
 *   screen.mount   ──► host.attach(container, layout, listener)   scene, camera, input
 *   store changes  ──► host.setStatuses(statuses)                 pedestals and links retint
 *   pick / click   ──► host.setSelected(id)                       the selected pedestal lights
 *   every move     ──► listener.framed(frame)                     labels follow the nodes
 *   screen.unmount ──► host.release()                             disposes everything
 * ```
 *
 * The screen works without one: it treats the host as optional, so the
 * jsdom specs and any headless caller run unchanged.
 */
export interface TechGraphHost {
  /**
   * Builds the scene for `layout` inside `container`. Replaces any
   * earlier attachment.
   */
  attach(
    container: HTMLElement,
    layout: TechGraphLayout,
    listener: TechGraphListener,
  ): void;

  /** Retints every node and link from `statuses`; a node missing from the map is shown locked. */
  setStatuses(statuses: ReadonlyMap<TechNodeId, TechNodeStatus>): void;

  /** Lights the selected node's pedestal, or none. */
  setSelected(nodeId: TechNodeId | undefined): void;

  /** Pans the camera onto `nodeId`. */
  focus(nodeId: TechNodeId): void;

  /** Tears the scene down. Safe to call when not attached. */
  release(): void;
}
