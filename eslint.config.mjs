import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores([
    "node_modules",
    "dist",
    "main.js",
    "scripts/**",
    "__tests__/**",
    "__mocks__/**",
    "jest.config.cjs",
    "jest.transform.cjs",
    "eslint.config.mjs",
  ]),
  ...obsidianmd.configs.recommended,
  {
    files: ["main.ts"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Deliberate shipped shortcuts and UI casing, not lint accidents.
      "obsidianmd/commands/no-default-hotkeys": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      "obsidianmd/ui/sentence-case": "off",
    },
  },
]);
