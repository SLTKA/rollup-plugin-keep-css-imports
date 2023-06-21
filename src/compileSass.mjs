import path from "path"
import { formatProcessedToCSS, requireSass } from "./helpers.mjs"

export const compileSass = async (
  sassPath,
  outWatchList,
  { stylesToEmit, outExt, sass, postProcessor, loadPaths, sourceMap, sassOptions },
) => {
  if (!sassPath) {
    return { css: "", map: "" }
  }

  let sassProcessor = sass || (await requireSass())
  if ("default" in sassProcessor && !("compileAsync" in sassProcessor)) {
    sassProcessor = sassProcessor.default
  }

  const watchListNeeded = Array.isArray(outWatchList)

  const compiled = await sassProcessor.compileAsync(sassPath, {
    loadPaths,
    style: "expanded",
    sourceMap: !!sourceMap || watchListNeeded,
    sourceMapIncludeSources: !!sourceMap || watchListNeeded,
    ...(sassOptions || []),
  })
  const css = compiled.css.toString()

  if (watchListNeeded && compiled.sourceMap && typeof compiled.sourceMap === "object") {
    const mapObject = typeof compiled.sourceMap.toJSON === "function" ? compiled.sourceMap.toJSON() : compiled.sourceMap

    const sources = mapObject.sources || mapObject._sources
    outWatchList.push(...sources.filter((s) => s && typeof s === "string"))
  }

  const map = compiled.sourceMap
    ? typeof compiled.sourceMap === "object"
      ? JSON.stringify(compiled.sourceMap)
      : compiled.sourceMap
    : ""

  if (typeof postProcessor === "function") {
    const result = await postProcessor(css, map, stylesToEmit)

    return formatProcessedToCSS(
      typeof result?.process === "function" // If PostCSS compatible result
        ? await Promise.resolve(
            result.process(css, {
              from: sassPath,
              to: path.parse(sassPath).name + outExt,
              map: map ? { prev: map, inline: false } : null,
            }),
          )
        : result,
      sourceMap,
    )
  }
  return { css, map: sourceMap ? map : undefined }
}
