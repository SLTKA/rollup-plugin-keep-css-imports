module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
    mocha: true,
  },
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  parserOptions: {
    sourceType: "module",
  },
  overrides: [],
  ignorePatterns: ["dist/**/*", "rollup.config.mjs"],
  plugins: ["prettier", "mocha"],
  rules: {
    "mocha/no-exclusive-tests": "error",
  },
}
