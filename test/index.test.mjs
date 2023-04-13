import assert from "assert"
import keepCssImportsPlugin from "../dist/index.mjs" //Testing built version
import { rollup } from "rollup"
import * as fs from "fs/promises"
import * as path from "path"

const inputOptions = {
  input: "test/input/sample.js",
  plugins: [keepCssImportsPlugin()],
}

const outputOptions = {
  file: "test/output/bundle.js",
  format: "esm",
  preserveModulesRoot: "test/input",
}

describe("keepCssImportsPlugin", () => {
  it("should have the correct plugin name", () => {
    assert.strictEqual(keepCssImportsPlugin().name, "keep-css-imports")
  })

  it("should process and emit CSS and SCSS files", async () => {
    // Run Rollup with the plugin and sample input files
    const bundle = await rollup(inputOptions)
    await bundle.write(outputOptions)

    // Read the emitted files
    const emittedJS = await fs.readFile(path.resolve("test/output/bundle.js"), "utf8")
    const emittedCSS = await fs.readFile(path.resolve("test/output/sample.css"), "utf8")
    const emittedSCSS = await fs.readFile(path.resolve("test/output/subfolder/sample.module.css"), "utf8")

    // Check if the emitted files are not empty and have the correct content
    assert.ok(emittedJS.trim().length > 0, "Emitted JS should not be empty")
    assert.ok(emittedCSS.trim().length > 0, "Emitted CSS should not be empty")
    assert.ok(emittedSCSS.trim().length > 0, "Emitted SCSS should not be empty")

    assert.ok(emittedJS.includes("import 'sample.css';"), "Emitted JS should have the correct imports")
    assert.ok(
      emittedJS.includes("import styles from 'subfolder/sample.module.css';"),
      "Emitted JS should have the correct imports",
    )

    assert.ok(emittedCSS.includes(".class1"), "Emitted CSS should have the correct content")
    assert.ok(emittedSCSS.includes(".subclass1"), "Emitted CSS from sSCSS should have the correct content")
  })

  after(async () => {
    // Clean up the output files after tests
    await fs.rm(path.resolve("test/output/bundle.js"))
    await fs.rm(path.resolve("test/output/sample.css"))
    await fs.rm(path.resolve("test/output/subfolder/sample.module.css"))
    await fs.rmdir(path.resolve("test/output/subfolder"))
    await fs.rmdir(path.resolve("test/output"))
  })
})
