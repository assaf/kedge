/** Jest config in CommonJS so it never needs a TypeScript loader itself. */
module.exports = {
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
  roots: ["<rootDir>"],
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/__mocks__/obsidian.ts",
  },
  transform: {
    "^.+\\.ts$": "<rootDir>/jest.transform.cjs",
  },
};
