import path from "path"
import { readFile } from "fs/promises"
import MagicString from "magic-string"
import { assertDuplicates, assertLocation, ensureSourceMap, escapeRegex } from "./helpers.mjs"
import { compileSass } from "./compileSass.mjs"

const PLUGIN_NAME = "keep-css-imports"
const KEY_EXT_STRING = ".[keep-css-imports-plugin-ext]"
const FILE_URL_PREFIX = new URL("file://").toString()

const createErrorMessage = (message) => `[${PLUGIN_NAME}] ${message}`

const addImportAndGetNewId = (importsArray, resolvedId) => {
  const moduleIndex = importsArray.indexOf(resolvedId)
  return !~moduleIndex ? importsArray.push(resolvedId) - 1 : moduleIndex
}

const ensureStylesInfo = (stylesMap, importer, resolvedId) => {
  stylesMap[resolvedId] = stylesMap[resolvedId] || { importers: [] }
  stylesMap[resolvedId].importers.push(importer)

  return stylesMap[resolvedId]
}

const ensureCodeAndWatchList = async (filePath, stylesInfo, isWatch, compilerOptions) => {
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

function keepCssImports(options = {}) {
  const outExt = options.outputExt || ".css"
  const outputPath = options.outputPath || "keep"
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : "./"
  const stylesToEmit = {}
  const modulesWithCss = new Set()
  const allStyleImports = []
  const skipCurrentFolderPart = options.skipCurrentFolderPart || false

  let loadPaths = options.includePaths || ["node_modules/"]
  loadPaths.push(process.cwd())
  loadPaths = loadPaths.filter((v, i, a) => a.indexOf(v) === i)

  const compilerOptions = {
    stylesToEmit,
    outExt,
    sass: options.sass,
    postProcessor: options.postProcessor,
    loadPaths,
    sourceMap: options.sourceMap,
    sassOptions: options.sassOptions,
  }

  return {
    name: PLUGIN_NAME,
    async resolveId(source, importer, resolveOptions) {
      if (!importer || !(options.includeRegexp || /\.(?:s[ca]|c)ss$/).test(source) || /\0/.test(source)) {
        return null
      }

      // Test if we are in plugins loop and exits if it is
      const { custom = {} } = resolveOptions
      const { [PLUGIN_NAME]: { resolving: alreadyResolving } = {} } = custom
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

      modulesWithCss.add(importer)
      const styleInfo = ensureStylesInfo(stylesToEmit, importer, resolved.id)

      await ensureCodeAndWatchList(resolved.id, styleInfo, this.meta.watchMode, compilerOptions)
      styleInfo.watchList.forEach((watchFile) => {
        this.addWatchFile(watchFile)
      })

      return {
        id: "\0" + addImportAndGetNewId(allStyleImports, resolved.id) + KEY_EXT_STRING,
        meta: { [PLUGIN_NAME]: { sourceId: resolved.id } },
        external: true,
      }
    },
    buildStart() {
      // Every rebuild will refresh watcher, so we need to reattach
      if (this.meta.watchMode) {
        const allWatched = this.getWatchFiles()
        Object.values(stylesToEmit).forEach((styleInfo) =>
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
      const filesToUpdate = Object.entries(stylesToEmit).filter(([, styleInfo]) =>
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

      if (code && chunk.modules && Object.keys(chunk.modules).some((m) => modulesWithCss.has(m))) {
        const magicString = new MagicString(code)
        const matchRegex = new RegExp(`\0([^"']+)${escapeRegex(KEY_EXT_STRING)}`, "g")
        const moduleRoot = outputOptions.preserveModulesRoot || process.cwd()
        Array.from(code.matchAll(matchRegex))
          .reverse()
          .forEach((m) => updateMatchedImport(m, bundleOutDir, moduleRoot, chunk, magicString, skipCurrentFolderPart))

        const result = { code: magicString.toString() }
        // Always output map as Rollup requires to provide it any way, then decides if need to output it
        result.map = magicString.generateMap({ hires: true })

        return result
      }

      return null
    },
    generateBundle(_, __, isWrite) {
      if (!isWrite) {
        return
      }

      assertDuplicates(stylesToEmit)

      for (const file in stylesToEmit) {
        const stylesInfo = stylesToEmit[file]
        const fileName = stylesInfo.output

        const source = file.endsWith(".css")
          ? stylesInfo.css
          : ensureSourceMap(stylesInfo, options.sourceMap || options.sassOptions?.sourceMap, fileName, this.emitFile)

        this.emitFile({
          type: "asset",
          fileName,
          source,
        })
      }
    },
  }

  function updateMatchedImport(m, bundleOutDir, moduleRoot, chunk, magicString, skipCurrent) {
    const importId = m[0]
    const assetId = allStyleImports[m[1]]
    if (!assetId || !stylesToEmit[assetId]) {
      return
    }
    const start = m.index
    const end = start + importId.length
    const assetOutput = resolveOutputPath(bundleOutDir, assetId, moduleRoot)
    let updatedImport = path
      .relative(path.dirname(path.resolve(bundleOutDir, chunk.fileName)), assetOutput)
      .replace(/\\/g, "/")

    if (
      (!skipCurrent || (skipCurrent instanceof RegExp && !skipCurrent.test(updatedImport))) &&
      !updatedImport.startsWith("./") &&
      !updatedImport.startsWith("../") &&
      !updatedImport.match(/^[a-zA-Z]:/)
    ) {
      updatedImport = "./" + updatedImport
    }

    stylesToEmit[assetId].output = path.relative(path.resolve(bundleOutDir), assetOutput)

    magicString.overwrite(start, end, updatedImport)
    if (chunk.importedBindings[importId]) {
      chunk.importedBindings[updatedImport] = chunk.importedBindings[importId]
      if (updatedImport !== importId) {
        delete chunk.importedBindings[importId]
      }
    }
    const importIndex = chunk.imports.indexOf(importId)
    if (~importIndex) {
      chunk.imports[importIndex] = updatedImport
    }
  }

  function resolveOutputPath(bundleOutDir, assetId, moduleRoot) {
    let newPath = undefined
    if (typeof outputPath === "function") {
      newPath = outputPath(assetId)
      assertLocation(bundleOutDir, newPath)
    } else if (typeof outputPath === "string") {
      newPath = path.resolve(
        bundleOutDir,
        outputDir,
        outputPath !== "keep" ? outputPath : path.relative(moduleRoot, assetId),
      )
      assertLocation(bundleOutDir, newPath)
    } else {
      throw new Error(createErrorMessage("Invalid outputPath option value!"))
    }

    return newPath.replace(/\.s[ca]ss$/, outExt)
  }
}

export default keepCssImports
