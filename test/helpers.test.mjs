import assert from "assert"
import {
  escapeRegex,
  assertDuplicates,
  assertLocation,
  ensureSourceMap,
  formatProcessedToCSS,
} from "../src/helpers.mjs"
import path from "path"

describe("Helpers", () => {
  describe("escapeRegex", () => {
    it("should escape regex special characters", () => {
      const input = "/-\\^$*+?.()|[]{}"
      const expected = "\\/\\-\\\\\\^\\$\\*\\+\\?\\.\\(\\)\\|\\[\\]\\{\\}"
      const result = escapeRegex(input)
      assert.strictEqual(result, expected)
    })
  })

  describe("assertDuplicates", () => {
    it("should throw an error for duplicate output paths", () => {
      const stylesToEmit = {
        "file1.scss": { output: "output/file1.css" },
        "file2.scss": { output: "output/file1.css" },
      }

      assert.throws(() => assertDuplicates(stylesToEmit), {
        message: /Two or more assets have conflicting output path/,
      })
    })

    it("should not throw an error for unique output paths", () => {
      const stylesToEmit = {
        "file1.scss": { output: "output/file1.css" },
        "file2.scss": { output: "output/file2.css" },
      }

      assert.doesNotThrow(() => assertDuplicates(stylesToEmit))
    })
  })

  describe("formatProcessedToCSS", () => {
    it("should return an object with css and map properties when given a string", () => {
      const input = "string"
      const expected = {
        css: "string",
        map: "",
      }
      const result = formatProcessedToCSS(input)
      assert.deepStrictEqual(result, expected)
    })

    it("should return an object with css and map properties when given an object", () => {
      const input = {
        css: "css string",
        map: {
          version: 3,
          sources: ["source.scss"],
          names: [],
          mappings: "AAAA",
        },
      }
      const expected = {
        css: "css string",
        map: JSON.stringify(input.map),
      }
      const result = formatProcessedToCSS(input, true)
      assert.deepStrictEqual(result, expected)
    })

    it("should return an object with css only when given an object and sourceMap false", () => {
      const input = {
        css: "css string",
        map: {
          version: 3,
          sources: ["source.scss"],
          names: [],
          mappings: "AAAA",
        },
      }
      const expected = {
        css: "css string",
        map: "",
      }
      const result = formatProcessedToCSS(input, false)
      assert.deepStrictEqual(result, expected)
    })
  })

  describe("assertLocation", () => {
    it("should throw an error when the asset path is not within the output directory", () => {
      const outputDir = path.resolve("output")
      const assetPathOutside = path.resolve("outside", "asset.css")

      assert.throws(() => assertLocation(outputDir, assetPathOutside), {
        message: `Output path ${assetPathOutside} must be in output directory ${outputDir}`,
      })
    })

    it("should not throw an error when the asset path is within the output directory", () => {
      const outputDir = path.resolve("output")
      const assetPathInside = path.resolve(outputDir, "asset.css")

      assert.doesNotThrow(() => assertLocation(outputDir, assetPathInside))
    })
  })

  describe("ensureSourceMap", () => {
    const css = "body { background: red; }"
    const map = '{"version":3,"file":"test.css","sources":["test.scss"],"names":[],"mappings":"AAAA"}'
    const fileName = "test.css"

    it('should append an inline sourceMappingURL to the CSS when sourceMap is "inline"', () => {
      const onEmit = () => {}
      const result = ensureSourceMap({ css, map }, "inline", fileName, onEmit)
      assert.strictEqual(
        result,
        `${css}\n/*# sourceMappingURL=data:application/json;base64,${Buffer.from(map, "utf8").toString("base64")}*/`,
      )
    })

    it("should append an external sourceMappingURL to the CSS and call onEmit when sourceMap is true", () => {
      let emitCalled = false
      const onEmit = (options) => {
        emitCalled = true
        assert.deepStrictEqual(options, {
          type: "asset",
          fileName: `${fileName}.map`,
          source: map,
        })
      }
      const result = ensureSourceMap({ css, map }, true, fileName, onEmit)
      assert.strictEqual(result, `${css}\n/*# sourceMappingURL=${path.basename(fileName)}.map */`)
      assert.strictEqual(emitCalled, true)
    })

    it("should not append sourceMappingURL to the CSS when sourceMap is false or undefined", () => {
      const onEmit = () => {}
      const result1 = ensureSourceMap({ css, map }, false, fileName, onEmit)
      const result2 = ensureSourceMap({ css, map }, undefined, fileName, onEmit)
      assert.strictEqual(result1, css)
      assert.strictEqual(result2, css)
    })
  })
})
