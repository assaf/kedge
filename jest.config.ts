export default {
  preset: "ts-jest",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
  roots: ["<rootDir>"],
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/__mocks__/obsidian.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
  },
};