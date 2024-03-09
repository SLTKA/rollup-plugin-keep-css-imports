import { readFile } from "fs/promises"
import * as path from "path"
import { compileSass, type CompilationOptions } from "./compileSass"
import { assertDuplicates, ensureSourceMap } from "./helpers"

import type { Plugin } from "rollup"
import { ImportUpdater } from "./ImportUpdater"
import { FILE_URL_PREFIX, PLUGIN_NAME } from "./constants"
import { KeepCssImportsOptions, KeepCssImportsPluginContext, StyleRefInfo, StylesMap } from "./types"

const ensureStylesInfo = (stylesMap: StylesMap, importer: string, resolvedId: string): StyleRefInfo => {
  stylesMap[resolvedId] = stylesMap[resolvedId] || { importers: [], watchList: [] }
  stylesMap[resolvedId].importers.push(importer)

  return stylesMap[resolvedId]
}

const ensureCodeAndWatchList = async (filePath, stylesInfo, isWatch, compilerOptions: CompilationOptions) => {
  const outWatchList = []

  if (filePath.endsWith(".css")) {
    stylesInfo.css = await readFile(filePath, "utf8")
  } else {
    const { css, map } = await compileSass(filePath, isWatch ? outWatchList : undefined, compilerOptions)
    stylesInfo.css = css
    stylesInfo.map = map
  }
  outWatchList.push(filePath)

  stylesInfo.watchList = outWatchList.map((watchFile) => path.resolve(watchFile.replace(FILE_URL_PREFIX, "")))
}

function keepCssImports({
  outputExt = ".css",
  outputPath = "keep",
  skipCurrentFolderPart = false,
  includeRegexp = /\.(?:s[ca]|c)ss$/,
  sass,
  postProcessor,
  sassOptions,
  ...options
}: KeepCssImportsOptions = {}): Plugin {
  const stylesOutputOptions = {
    outputPath,
    outputExt,
    outputDir: options.outputDir ? path.resolve(options.outputDir) : "./",
    skipCurrentFolderPart,
  }
  const context: KeepCssImportsPluginContext = {
    allStyleImports: [],
    modulesWithCss: new Set<string>(),
    stylesToEmit: {},
  }

  const importUpdater = new ImportUpdater(context, stylesOutputOptions)

  let loadPaths = options.includePaths || ["node_modules/"]
  loadPaths.push(process.cwd())
  loadPaths = loadPaths.filter((v, i, a) => a.indexOf(v) === i)

  const compilerOptions: CompilationOptions = {
    outputExt,
    sass,
    postProcessor:
      typeof postProcessor === "function"
        ? (css: string, map: string) => postProcessor(css, map, context.stylesToEmit)
        : undefined,
    loadPaths,
    sourceMap: !!options.sourceMap,
    sassOptions,
  }

  return {
    name: PLUGIN_NAME,
    async resolveId(source, importer, resolveOptions) {
      if (!importer || !includeRegexp.test(source) || /\0/.test(source)) {
        return null
      }

      // Test if we are in plugins loop and exits if it is
      const { custom = {} } = resolveOptions
      const { [PLUGIN_NAME]: { resolving: alreadyResolving = false } = {} } = custom
      if (alreadyResolving) {
        return null
      }

      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
        ...resolveOptions,
        custom: { ...custom, [PLUGIN_NAME]: { ...custom[PLUGIN_NAME], resolving: true } },
      })

      if (!resolved || resolved.external) {
        return resolved
      }

      context.modulesWithCss.add(importer)
      const styleInfo = ensureStylesInfo(context.stylesToEmit, importer, resolved.id)

      await ensureCodeAndWatchList(resolved.id, styleInfo, this.meta.watchMode, compilerOptions)
      styleInfo.watchList.forEach((watchFile) => {
        this.addWatchFile(watchFile)
      })

      return {
        id: importUpdater.getMagicId(resolved.id),
        meta: { [PLUGIN_NAME]: { sourceId: resolved.id } },
        external: true,
      }
    },
    buildStart() {
      // Every rebuild will refresh watcher, so we need to reattach
      if (this.meta.watchMode) {
        const allWatched = this.getWatchFiles()
        Object.values(context.stylesToEmit).forEach((styleInfo) =>
          styleInfo.watchList.forEach((watchFile) => {
            if (!allWatched.find((watched) => path.normalize(watched) === path.normalize(watchFile))) {
              this.addWatchFile(watchFile)
            }
          }),
        )
      }
    },
    async watchChange(id) {
      const resolvedId = path.resolve(id)
      const filesToUpdate = Object.entries(context.stylesToEmit).filter(([, styleInfo]) =>
        styleInfo.watchList.includes(resolvedId),
      )
      await Promise.all(
        filesToUpdate.map(([fileName, styleInfo]) =>
          ensureCodeAndWatchList(fileName, styleInfo, this.meta.watchMode, compilerOptions),
        ),
      )
    },
    renderChunk(code, chunk, outputOptions) {
      const bundleOutDir = path.resolve(outputOptions.dir || path.dirname(outputOptions.file))

      if (code && chunk.modules && Object.keys(chunk.modules).some((m) => context.modulesWithCss.has(m))) {
        const moduleRoot = outputOptions.preserveModulesRoot || process.cwd()

        return importUpdater.updateImports(code, chunk, bundleOutDir, moduleRoot)
      }

      return null
    },
    generateBundle(_, __, isWrite) {
      if (!isWrite) {
        return
      }

      assertDuplicates(context.stylesToEmit)

      for (const file in context.stylesToEmit) {
        const stylesInfo = context.stylesToEmit[file]
        const fileName = stylesInfo.output

        const source = file.endsWith(".css")
          ? stylesInfo.css
          : ensureSourceMap(stylesInfo, options.sourceMap || sassOptions?.sourceMap, fileName, this.emitFile)

        this.emitFile({
          type: "asset",
          fileName,
          source,
        })
      }
    },
  }
}

export default keepCssImports
