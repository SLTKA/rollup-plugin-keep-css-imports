# Rollup Plugin: Keep CSS Imports

`rollup-plugin-keep-css-imports` is a Rollup plugin that allows to maintain
the original structure of style imports (CSS, SCSS, or SASS) without altering
them during the bundling process.

## Why?

It will be helpful for building a components library and want to keep
all CSS module imports untouched so consumer decide how to bundle or tree shake
them. This plugin support both bundled and preserved modules ESM outputs.

## Features

- Keeps style imports unchanged
- Supports CSS, SCSS, and SASS files
- Allows the use of custom output paths and extensions
- Emits assets to the specified output directory
- Supports source maps
- Compatible with PostCSS

Installation

Install via npm:

```sh
npm install rollup-plugin-keep-css-imports --save-dev
```

or via yarn:

```sh
yarn add rollup-plugin-keep-css-imports --dev
```

Usage

Add the plugin to Rollup configuration file:

```js
import keepCssImports from "rollup-plugin-keep-css-imports"

export default {
  input: "src/index.js",
  output: {
    file: "dist/bundle.js",
    format: "esm",
  },
  plugins: [
    keepCssImports({
      // Plugin options go here
    }),
  ],
}
```

## Options

### outputExt

|          |          |
| -------- | -------- |
| Type:    | `string` |
| Default: | `".css"` |

Specifies the file extension for the output CSS files. This is typically ".css"
but can be changed if needed.

### outputDir

|          |          |
| -------- | -------- |
| Type:    | `string` |
| Default: | `"./"`   |

Specifies the output directory for the generated CSS files. Relative to Rollup
output folder.

### outputPath

|          |                                    |
| -------- | ---------------------------------- |
| Type:    | `"keep"` \| `string` \| `function` |
| Default: | `"keep"`                           |

Specifies the output path relative to `outputDir` for the generated CSS files.
The default value, "keep", preserves the original file paths. It is also
possible to provide a custom function to generate output paths based on the
input file.

**Example:**

```js
import keepCssImports from "rollup-plugin-keep-css-imports"
import path from "path"

export default {
  input: "src/index.js",
  output: {
    file: "dist/bundle.js",
    format: "esm",
  },
  plugins: [
    keepCssImports({
      outputPath: (assetId) => {
        // Generate a custom output path based on the input assetId

        // Make the assetId path relative to the current working directory (CWD)
        const relativePath = path.relative(process.cwd(), assetId)

        // Replace 'src' with 'styles' in the relativePath
        const newPath = relativePath.replace("src", "styles")

        // Add a '.min' suffix before the file extension,
        // extension will be replaced with `outputExt` by the plugin
        return newPath.replace(/(\.s[ca]ss)$/, ".min$1")
      },
    }),
  ],
}
```

### includePaths

|          |                     |
| -------- | ------------------- |
| Type:    | `Array<string>`     |
| Default: | `["node_modules/"]` |

Specifies the list of include paths for SASS to search when resolving imports.

### sass

|          |                 |
| -------- | --------------- |
| Type:    | `Sass compiler` |
| Default: | `Dart Sass`     |

An optional object that allows you to provide a custom SASS implementation,
such as Dart SASS or Node SASS. If not specified you must install Dart SASS
(`npm install sass --save-dev` / `yarn add sass --dev`)

### postProcessor

|          |             |
| -------- | ----------- |
| Type:    | `function`  |
| Default: | `undefined` |

An optional function that allows you to perform additional processing on the
generated CSS, such as applying PostCSS plugins.

**Example:**
Use PostCSS with the `postcss-url` plugin to inline the URLs in the CSS files:

```js
import keepCssImports from "rollup-plugin-keep-css-imports"
import path from "path"
import postcss from "postcss"
import url from "postcss-url"

export default {
  input: "src/index.js",
  output: {
    file: "dist/bundle.js",
    format: "esm",
  },
  plugins: [
    keepCssImports({
      postProcessor: () =>
        postcss([
          url({
            url: "inline",
            basePath: [path.resolve("src"), path.resolve("node_modules")],
          }),
        ]),
    }),
  ],
}
```

### sourceMap

|          |                         |
| -------- | ----------------------- |
| Type:    | `boolean` \| `"inline"` |
| Default: | `false`                 |

Specifies whether to generate source maps for the compiled CSS.
Use `"inline"` to inline source maps into CSS files.

### sassOptions

|          |             |
| -------- | ----------- |
| Type:    | `Object`    |
| Default: | `undefined` |

An optional object that allows to provide additional options for the SASS
compiler.

## Notes

- Plugin reads `preserveModulesRoot` property of Rollup output settings, so it
  can be used to make output tree depth smaller

## License

[MIT](./LICENSE)

Copyright (c) 2023 Alexandr Yeskov
