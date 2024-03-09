module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
    mocha: true,
  },
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  parserOptions: {
    sourceType: "module",
  },
  overrides: [],
  ignorePatterns: ["dist/**/*", "rollup.config.mjs"],
  plugins: ["mocha", "@typescript-eslint", "prettier"],
  rules: {
    "mocha/no-exclusive-tests": "error",
  },
}
