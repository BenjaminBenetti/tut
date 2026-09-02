import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// ===========================================
// Layering (docs/design/architecture.md §3)
// ===========================================

/**
 * Domains that form the simulation and foundation layers. They never
 * import three.js, never touch the DOM, and never import presentation
 * or app code. Imports only point downward.
 */
const SIMULATION_DOMAINS = [
  "core",
  "save",
  "content",
  "overworld",
  "economy",
  "roster",
  "tactical",
  "bugs",
  "mapgen",
];

const simulationFiles = SIMULATION_DOMAINS.map(
  (domain) => `src/${domain}/**/*.ts`,
);

const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "fetch",
  "HTMLElement",
  "HTMLCanvasElement",
];

const DOM_MESSAGE =
  "Simulation code never touches the DOM (architecture §2). Inject an interface instead.";

const THREE_MESSAGE =
  "Simulation code never imports three.js (architecture §2). Presentation renders from state.";

const UPWARD_MESSAGE =
  "Simulation domains never import ui, graphics, or app (architecture §3). Imports point downward only.";

const RANDOM_MESSAGE =
  "No Math.random() outside core/'s RNG implementation. Inject an Rng from core/model/rng.";

// ===========================================
// Config
// ===========================================

export default defineConfig(
  globalIgnores([
    "dist/**",
    "node_modules/**",
    ".pnpm-store/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),

  // ---- All TypeScript: typed linting + doc comments ----
  {
    files: ["**/*.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      jsdoc.configs["flat/recommended-typescript-error"],
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: RANDOM_MESSAGE },
      ],
      // CLAUDE.md: every method has a JSDoc comment. Types come from TS,
      // so param/returns tags are optional; the description is not.
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: false,
          require: {
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            MethodDefinition: true,
          },
          contexts: [
            "PropertyDefinition > ArrowFunctionExpression",
            "TSMethodSignature",
          ],
        },
      ],
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/tag-lines": "off",
    },
  },

  // ---- Simulation and foundation layers: no three.js, no DOM, no upward imports ----
  {
    files: simulationFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "three", message: THREE_MESSAGE }],
          patterns: [
            { group: ["three/*", "three/**"], message: THREE_MESSAGE },
            {
              group: ["**/ui/**", "**/graphics/**", "**/app/**"],
              message: UPWARD_MESSAGE,
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...DOM_GLOBALS.map((name) => ({ name, message: DOM_MESSAGE })),
      ],
    },
  },

  // ---- The one sanctioned Math.random() site ----
  {
    files: ["src/core/service/random-seed.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // ---- Tests and e2e: doc comments optional ----
  {
    files: ["src/**/*.test.ts", "e2e/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },

  // ---- Node-side config files: plain JS, no type information ----
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  // Prettier last so it disables any formatting rules above.
  prettier,
);
