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
      // Deliberate shipped UI casing, not a lint accident.
      "obsidianmd/ui/sentence-case": "off",
    },
  },
]);
