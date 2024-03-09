import * as path from "path"
import { formatProcessedToCSS, requireSass } from "./helpers"
import type { AsyncCompiler, Options } from "sass"

type SassAsyncCompiler = Pick<AsyncCompiler, "compileAsync" | "compileStringAsync">

async function ensureCompiler(sass?: SassAsyncCompiler) {
  const sassProcessor: SassAsyncCompiler = sass || (await requireSass())
  if (!("compileAsync" in sassProcessor)) {
    throw new Error(
      "You have to install `sass` package! Or provide an object which implements `compileAsync` as `sass` option",
    )
  }
  return sassProcessor
}

export type PostCssCompatible = {
  process: (
    css: string,
    opt: {
      from: string
      to: string
      map: { prev: string; inline: boolean } | null
    },
  ) => string | { css: string; map?: string }
}

export interface CompilationOptions {
  outputExt: string
  sass?: SassAsyncCompiler
  postProcessor?: (css: string, map: string) => Promise<PostCssCompatible | string | { css: string; map?: string }>
  loadPaths?: string[]
  sourceMap?: boolean
  sassOptions: Options<"async">
}

const isPostCssCompatible = (result: unknown): result is PostCssCompatible =>
  result && typeof result === "object" && "process" in result && typeof result.process === "function"

export const compileSass = async (
  sassPath: string,
  outWatchList: string[] | undefined,
  { outputExt, sass, postProcessor, loadPaths, sourceMap, sassOptions }: CompilationOptions,
) => {
  if (!sassPath) {
    return { css: "", map: "" }
  }

  const sassProcessor: SassAsyncCompiler = await ensureCompiler(sass)

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
    const mapObject =
      "toJSON" in compiled.sourceMap && typeof compiled.sourceMap.toJSON === "function"
        ? compiled.sourceMap.toJSON()
        : compiled.sourceMap

    const sources = mapObject.sources || mapObject._sources
    outWatchList.push(...sources.filter((s) => s && typeof s === "string"))
  }

  const map = compiled.sourceMap
    ? typeof compiled.sourceMap === "object"
      ? JSON.stringify(compiled.sourceMap)
      : compiled.sourceMap
    : ""

  if (typeof postProcessor === "function") {
    const result = await postProcessor(css, map)

    if ((typeof result !== "string" && typeof result !== "object") || result === null) {
      throw new Error(
        "`postProcessor` must return string, object with `css` and `map` or PostCSS like object which implements `process` function",
      )
    }

    return formatProcessedToCSS(
      isPostCssCompatible(result) // If PostCSS compatible result
        ? await Promise.resolve(
            result.process(css, {
              from: sassPath,
              to: path.parse(sassPath).name + outputExt,
              map: map ? { prev: map, inline: false } : null,
            }),
          )
        : result,
      sourceMap,
    )
  }
  return { css, map: sourceMap ? map : undefined }
}
