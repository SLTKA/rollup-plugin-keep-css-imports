import MagicString from "magic-string"
import * as path from "path"
import { assertLocation, escapeRegex } from "./helpers"
import type { RenderedChunk } from "rollup"
import { OutputOptions, KeepCssImportsPluginContext } from "./types"
import { KEY_EXT_STRING, PLUGIN_NAME } from "./constants"

interface ChunkDetails {
  chunk: RenderedChunk
  bundleOutDir: string
  moduleRoot: string
}

const createErrorMessage = (message) => `[${PLUGIN_NAME}] ${message}`

export class ImportUpdater {
  private _outputOptions: OutputOptions
  private _pluginContext: KeepCssImportsPluginContext

  constructor(pluginContext: KeepCssImportsPluginContext, outputOptions: OutputOptions) {
    this._pluginContext = pluginContext
    this._outputOptions = outputOptions
  }

  getMagicId(id: string) {
    return "\0" + this.addImportAndGetNewId(id) + KEY_EXT_STRING
  }

  updateImports(code: string, chunk: RenderedChunk, bundleOutDir: string, moduleRoot: string) {
    const magicString = new MagicString(code)

    const matchRegex = new RegExp(`\0([^"']+)${escapeRegex(KEY_EXT_STRING)}`, "g")
    Array.from(code.matchAll(matchRegex))
      .reverse()
      .forEach((m) =>
        this.updateMatchedImport(m, magicString, {
          chunk,
          bundleOutDir,
          moduleRoot,
        }),
      )

    return {
      code: magicString.toString(),
      map: magicString.generateMap({ hires: true }),
    }
  }

  updateMatchedImport(m: RegExpMatchArray, magicString: MagicString, chunkDetails: ChunkDetails) {
    const importId = m[0]
    const assetId = this._pluginContext.allStyleImports[m[1]]
    if (!assetId || typeof assetId !== "string" || !this._pluginContext.stylesToEmit[assetId]) {
      return
    }

    const updatedImport = this.saveAndGetUpdatedImportPath(assetId, chunkDetails)

    const start = m.index
    const end = start + importId.length

    magicString.overwrite(start, end, updatedImport)

    this.updateChunk(importId, updatedImport, chunkDetails.chunk)
  }

  private addImportAndGetNewId = (resolvedId) => {
    const moduleIndex = this._pluginContext.allStyleImports.indexOf(resolvedId)
    return !~moduleIndex ? this._pluginContext.allStyleImports.push(resolvedId) - 1 : moduleIndex
  }

  private updateChunk(importId: string, updatedImport: string, chunk: RenderedChunk) {
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

  private saveAndGetUpdatedImportPath(assetId: string, { bundleOutDir, moduleRoot, chunk }: ChunkDetails) {
    const assetOutput = this.resolveOutputPath(bundleOutDir, assetId, moduleRoot)
    let updatedImport = path
      .relative(path.dirname(path.resolve(bundleOutDir, chunk.fileName)), assetOutput)
      .replace(/\\/g, "/")

    this._pluginContext.stylesToEmit[assetId].output = path.relative(path.resolve(bundleOutDir), assetOutput)

    if (
      this.shouldAddPrefixCurrentDir(updatedImport) &&
      !updatedImport.startsWith("./") &&
      !updatedImport.startsWith("../") &&
      !updatedImport.match(/^[a-zA-Z]:/)
    ) {
      updatedImport = "./" + updatedImport
    }
    return updatedImport
  }

  private shouldAddPrefixCurrentDir(updatedImport: string) {
    const { skipCurrentFolderPart: skip } = this._outputOptions
    return !skip || (skip instanceof RegExp && !skip.test(updatedImport))
  }

  private resolveOutputPath(bundleOutDir: string, assetId: string, moduleRoot: string) {
    const { outputPath, outputDir, outputExt } = this._outputOptions
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

    return newPath.replace(/\.s[ca]ss$/, outputExt)
  }
}
