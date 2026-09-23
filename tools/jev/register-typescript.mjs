import { registerHooks } from "node:module";
import { extname } from "node:path";

// Node's native TypeScript transform does not resolve the game's extensionless bundler imports.
registerHooks({
  /** Resolve actual game modules without compiling or duplicating simulation rules for the CLI tools. */
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (
        error.code !== "ERR_MODULE_NOT_FOUND" ||
        !specifier.startsWith(".") ||
        extname(specifier)
      )
        throw error;
      return next(`${specifier}.ts`, context);
    }
  },
});
