import pkg from "./package.json" assert { type: "json" }
import typescript from "@rollup/plugin-typescript"
import { dts } from "rollup-plugin-dts"

export default {
  input: "src/index.ts",
  output: [
    { file: pkg.main, format: "cjs" },
    { file: pkg.module, format: "es" },
  ],
  plugins: [
    typescript({
      exclude: ["**/__tests__", "**/*.test.ts"],
      declaration: true,
      declarationDir: "dist/"
    }),
  ],
  external: [...Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }), "path", "sass", "fs/promises"],
}
