import "../../ui/style/theme.css";
import "../../ui/style/screens.css";

import { randomSeed } from "../../core/service/random-seed";
import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import { IsometricCameraRig } from "../../graphics/service/isometric-camera-rig";
import { SceneService } from "../../graphics/service/scene-service";
import { PlaceholderTacticalView } from "../../graphics/view/placeholder-tactical-view";
import { GAME_STATE_MIGRATIONS } from "../../save/data/migrations";
import type { GameState } from "../../save/model/game-state";
import { GAME_STATE_SCHEMA_VERSION } from "../../save/model/game-state";
import { KeyValueSaveRepository } from "../../save/repository/key-value-save-repository";
import { WebStorageKeyValueStore } from "../../save/repository/web-storage-key-value-store";
import { MigrationRunner } from "../../save/service/migration-runner";
import { SaveCodec } from "../../save/service/save-codec";
import { SaveService } from "../../save/service/save-service";
import type { ScreenId } from "../../ui/model/screen";
import { MainMenuScreen } from "../../ui/screen/main-menu-screen";
import { OverworldScreen } from "../../ui/screen/overworld-screen";
import type { ScreenFactory } from "./dom-screen-router";
import { DomScreenRouter } from "./dom-screen-router";
import { InMemoryGameSession } from "./game-session";

// ===========================================
// Bootstrap
// ===========================================

/**
 * The composition root. Builds every long-lived object once, wires them
 * together, shows the main menu and marks the document ready after the
 * first rendered frame (the hook end-to-end tests wait on).
 *
 * ```
 *   document
 *     ├── #app  ◀── SceneService (three.js canvas, camera rig, input)
 *     └── #ui   ◀── DomScreenRouter ──▶ MainMenuScreen / OverworldScreen
 *                        │                        │
 *                        │                        ├── GameSession (live state)
 *                        │                        └── SaveService ◀── localStorage
 *                        └── body[data-screen]
 * ```
 */
export async function bootstrapApp(doc: Document): Promise<void> {
  const appRoot = requireElement(doc, "app");
  const uiRoot = requireElement(doc, "ui");
  const window = doc.defaultView;
  if (!window) {
    throw new Error("Document is not attached to a window");
  }

  const scene = composeScene(appRoot);
  const saves = composeSaveService(window.localStorage);
  const session = new InMemoryGameSession();

  const router: DomScreenRouter = new DomScreenRouter(
    uiRoot,
    new Map<ScreenId, ScreenFactory>([
      [
        "main-menu",
        () =>
          new MainMenuScreen({
            router,
            session,
            saves,
            newSeed: randomSeed,
            now: () => new Date().toISOString(),
          }),
      ],
      ["overworld", () => new OverworldScreen({ router, session })],
    ]),
  );

  router.navigate("main-menu");
  scene.start();
  await scene.whenFirstFrameRendered();
  doc.body.dataset.appState = "ready";
}

// ===========================================
// Composition helpers
// ===========================================

/**
 * The placeholder tactical scene from the camera-rig milestone: content,
 * isometric rig and its input controller, mounted into the given container.
 */
function composeScene(container: HTMLElement): SceneService {
  const view = new PlaceholderTacticalView();
  const rig = new IsometricCameraRig({ target: view.centre });
  const cameraInput = new CameraInputController(rig);
  const scene = new SceneService(container, {
    camera: rig,
    content: view.root,
    updatables: [cameraInput],
  });
  cameraInput.attach(container);
  return scene;
}

/**
 * The save stack over browser storage: store → repository → codec (with
 * the migration chain validated up front) → service.
 */
function composeSaveService(storage: Storage): SaveService<GameState> {
  const repository = new KeyValueSaveRepository(
    new WebStorageKeyValueStore(storage),
  );
  const codec = new SaveCodec<GameState>(
    GAME_STATE_SCHEMA_VERSION,
    new MigrationRunner(GAME_STATE_MIGRATIONS, GAME_STATE_SCHEMA_VERSION),
  );
  return new SaveService(codec, repository);
}

/** Looks up a required mount point by id; a missing one is a page bug. */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} container element`);
  }
  return element;
}
