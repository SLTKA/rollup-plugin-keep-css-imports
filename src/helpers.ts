import * as path from "path"
import { EmitFile } from "rollup"
import { StylesMap } from "./types"

export const escapeRegex = (val) => val.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&")

export const assertDuplicates = (stylesToEmit: StylesMap) => {
  Object.values(stylesToEmit).forEach((v, i, all) => {
    if (all.some((av, ai) => !!v.output && v.output === av.output && ai != i)) {
      throw new Error(`Two or more assets have conflicting output path ${v.output}`)
    }
  })
}
export const assertLocation = (outDir, assetPath) => {
  if (!path.normalize(assetPath).startsWith(path.normalize(outDir))) {
    throw new Error(`Output path ${assetPath} must be in output directory ${outDir}`)
  }
}

export const ensureSourceMap = (
  { css, map }: { css?: string | Uint8Array; map?: string | Uint8Array },
  includeSourceMap: boolean | "inline" | undefined,
  fileName: string,
  onEmit: EmitFile,
) => {
  if (map) {
    if (includeSourceMap === "inline") {
      css += `\n/*# sourceMappingURL=data:application/json;base64,${(map instanceof Uint8Array ? Buffer.from(map) : Buffer.from(map, "utf8")).toString("base64")}*/`
    } else if (includeSourceMap === true) {
      css += `\n/*# sourceMappingURL=${path.basename(fileName)}.map */`
    }

    if (includeSourceMap === true) {
      onEmit({
        type: "asset",
        fileName: fileName + ".map",
        source: map,
      })
    }
  }
  return css
}

export const formatProcessedToCSS = (input: string | { css: string; map?: string | object }, sourceMap: boolean) =>
  typeof input === "string"
    ? { css: input, map: "" }
    : typeof input === "object"
      ? {
          css: input.css,
          map: !sourceMap ? "" : typeof input.map === "object" ? JSON.stringify(input.map) : input.map,
        }
      : input

export const requireSass = () => {
  try {
    return import("sass")
  } catch (e) {
    throw new Error(
      "You have to install `sass` package! Try running\n\t" +
        "npm install --save-dev sass\nor\nyarn add sass --dev\n" +
        "or use `sass` option to pass processor",
    )
  }
}
