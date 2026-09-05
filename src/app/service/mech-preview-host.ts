import { MODEL_MANIFEST } from "../../graphics/data/model-manifest";
import { mechAssemblyFor } from "../../graphics/data/part-model-table";
import type { ModelLoader } from "../../graphics/model/model-loader";
import { GltfModelLoader } from "../../graphics/service/gltf-model-loader";
import { MechAssembler } from "../../graphics/service/mech-assembler";
import { MechPreviewScene } from "../../graphics/service/mech-preview-scene";
import { PlaceholderModelFactory } from "../../graphics/service/placeholder-model-factory";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { MechPreviewHost } from "../../ui/model/mech-preview-host";

// ===========================================
// Types
// ===========================================

/** What the host needs from the environment. */
export interface DomMechPreviewHostDeps {
  /** Loads part models; the app passes the manifest loader, tests a stub. */
  readonly models?: ModelLoader;
  /** Public base URL for the manifest loader when `models` is not given. */
  readonly baseUrl?: string;
}

// ===========================================
// DomMechPreviewHost
// ===========================================

/**
 * `MechPreviewHost` over three.js: the §7 part table resolves the draft
 * to model ids, `MechAssembler` hangs them on the §6 sockets, and
 * `MechPreviewScene` draws the result in the mech bay's panel.
 *
 * ```
 *   show(loadout) ──► mechAssemblyFor ──► assembler.assemble ──► scene.show
 * ```
 *
 * Each `show` takes a ticket. Only the newest one is allowed to draw,
 * so switching parts faster than the GLBs load still ends on the mech
 * the player last chose rather than whichever fetch happened to finish
 * last.
 */
export class DomMechPreviewHost implements MechPreviewHost {
  // ===========================================
  // Fields
  // ===========================================

  private readonly assembler: MechAssembler;
  private scene: MechPreviewScene | undefined;
  /** Bumped by every `show`; a resolved assembly draws only if it still matches. */
  private generation = 0;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Model loader and base URL. */
  constructor(deps: DomMechPreviewHostDeps = {}) {
    this.assembler = new MechAssembler({
      models:
        deps.models ??
        new GltfModelLoader({
          manifest: MODEL_MANIFEST,
          baseUrl: deps.baseUrl ?? "/",
          fallback: new PlaceholderModelFactory(),
          logger: console,
        }),
      logger: console,
    });
  }

  // ===========================================
  // MechPreviewHost
  // ===========================================

  /** Builds the scene inside `container`, releasing any earlier one. */
  attach(container: HTMLElement): void {
    this.release();
    this.scene = new MechPreviewScene(container);
  }

  /** Assembles `loadout` and draws it, unless a newer call has superseded this one. */
  async show(loadout: MechLoadout): Promise<void> {
    const ticket = ++this.generation;
    const mech = await this.assembler.assemble(mechAssemblyFor(loadout));
    if (ticket !== this.generation || !this.scene) {
      return;
    }
    this.scene.show(mech);
  }

  /** Disposes the scene. Safe to call when not attached. */
  release(): void {
    this.scene?.release();
    this.scene = undefined;
    // Anything still loading belongs to a scene that no longer exists.
    this.generation += 1;
  }
}
