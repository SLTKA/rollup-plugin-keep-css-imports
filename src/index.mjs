import path from "path"
import { readFile } from "fs/promises"
import MagicString from "magic-string"
import {
  assertDuplicates,
  assertLocation,
  ensureSourceMap,
  escapeRegex,
  formatProcessedToCSS,
  requireSass,
} from "./helpers.mjs"

const PLUGIN_NAME = "keep-css-imports"
const KEY_EXT_STRING = ".[keep-css-imports-plugin-ext]"

const compileSass = async (
  sassPath,
  { stylesToEmit, outExt, sass, postProcessor, loadPaths, sourceMap, sassOptions },
) => {
  if (!sassPath) {
    return { css: "", map: "" }
  }

  let sassProcessor = sass || (await requireSass())
  if ("default" in sassProcessor && !("compileAsync" in sassProcessor)) {
    sassProcessor = sassProcessor.default
  }
  const compiled = await sassProcessor.compileAsync(sassPath, {
    loadPaths,
    style: "expanded",
    sourceMap: !!sourceMap,
    sourceMapIncludeSources: !!sourceMap,
    ...(sassOptions || []),
  })
  const css = compiled.css.toString()
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
    )
  }
  return { css, map }
}

const createErrorMessage = (message) => `[${PLUGIN_NAME}] ${message}`

const addImportAndGetNewId = (importsArray, resolvedId) => {
  const moduleIndex = importsArray.indexOf(resolvedId)
  return !~moduleIndex ? importsArray.push(resolvedId) - 1 : moduleIndex
}

const registerImporter = (modulesWithCss, stylesMap, importer, resolvedId) => {
  modulesWithCss.add(importer)

  stylesMap[resolvedId] = stylesMap[resolvedId] || { importers: [] }
  stylesMap[resolvedId].importers.push(importer)
}

function keepCssImports(options = {}) {
  const outExt = options.outputExt || ".css"
  const outputPath = options.outputPath || "keep"
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : "./"
  const stylesToEmit = {}
  const modulesWithCss = new Set()
  const allStyleImports = []

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
      if (!importer || !(options.includeRegexp || /\.(?:s[ca]|c)ss$/).test(source)) {
        return null
      }

      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
        ...resolveOptions,
      })

      if (!resolved || resolved.external) {
        return resolved
      }

      registerImporter(modulesWithCss, stylesToEmit, importer, resolved.id)

      return {
        id: addImportAndGetNewId(allStyleImports, resolved.id) + KEY_EXT_STRING,
        meta: { [PLUGIN_NAME]: { sourceId: resolved.id } },
        external: true,
      }
    },
    renderChunk(code, chunk, outputOptions) {
      const bundleOutDir = path.resolve(outputOptions.dir || path.dirname(outputOptions.file))

      if (code && chunk.modules && Object.keys(chunk.modules).some((m) => modulesWithCss.has(m))) {
        const magicString = new MagicString(code)
        const matchRegex = new RegExp(`([^"']+)${escapeRegex(KEY_EXT_STRING)}`, "g")
        const moduleRoot = outputOptions.preserveModulesRoot || process.cwd()
        Array.from(code.matchAll(matchRegex))
          .reverse()
          .forEach((m) => updateMatchedImport(m, bundleOutDir, moduleRoot, chunk, magicString))

        const result = { code: magicString.toString() }
        if (options.sourceMap) {
          result.map = magicString.generateMap({ hires: true })
        }
        return result
      }

      return null
    },
    async generateBundle(_, __, isWrite) {
      if (!isWrite) {
        return
      }

      assertDuplicates(stylesToEmit)

      for (const file in stylesToEmit) {
        const fileName = stylesToEmit[file].output

        const source = file.endsWith(".css")
          ? await readFile(file, "utf8")
          : ensureSourceMap(
              await compileSass(file, compilerOptions),
              options.sourceMap || options.sassOptions?.sourceMap,
              fileName,
              this.emitFile,
            )

        this.emitFile({
          type: "asset",
          fileName,
          source,
        })
      }
    },
  }

  function updateMatchedImport(m, bundleOutDir, moduleRoot, chunk, magicString) {
    const importId = m[0]
    const assetId = allStyleImports[m[1]]
    if (!assetId || !stylesToEmit[assetId]) {
      return
    }
    const start = m.index
    const end = start + importId.length
    const assetOutput = resolveOutputPath(bundleOutDir, assetId, moduleRoot)
    const updatedImport = path
      .relative(path.dirname(path.resolve(bundleOutDir, chunk.fileName)), assetOutput)
      .replace(/\\/g, "/")

    stylesToEmit[assetId].output = path.relative(path.resolve(bundleOutDir), assetOutput)

    magicString.overwrite(start, end, updatedImport)
    if (chunk.importedBindings[importId]) {
      chunk.importedBindings[updatedImport] = chunk.importedBindings[importId]
      chunk.importedBindings[importId]
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
