/**
 * Jest transform for TypeScript, on esbuild.
 *
 * ts-jest loads the TypeScript JavaScript compiler API, which TypeScript 7 no
 * longer ships (it is the native compiler), and ts-jest's peer range stops at
 * <7. Type checking is not the transformer's job here anyway — `npm test` runs
 * `tsc --noEmit` first — so jest only needs TypeScript → CommonJS, which
 * esbuild already does for the bundle. `diagnostics: false` in the old ts-jest
 * config meant the same thing.
 */
const { transformSync } = require("esbuild");

module.exports = {
  process(sourceText, sourcePath) {
    const { code } = transformSync(sourceText, {
      loader: "ts",
      format: "cjs",
      target: "node20",
      sourcefile: sourcePath,
      sourcemap: "inline",
    });
    return { code };
  },
};
