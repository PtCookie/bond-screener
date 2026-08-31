import { resolve } from "node:path";
import { defineConfig, includeIgnoreFile } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tsEslint from "typescript-eslint";
import pluginAstro from "eslint-plugin-astro";
import pluginReact from "@eslint-react/eslint-plugin";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginVitest from "@vitest/eslint-plugin";

export default defineConfig([
  includeIgnoreFile(resolve(import.meta.dirname, ".gitignore")),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  tsEslint.configs.strict,
  tsEslint.configs.stylistic,
  pluginAstro.configs.recommended,
  { files: ["**/*.{jsx,tsx}"], ...pluginReact.configs.strict },
  ...pluginQuery.configs["flat/recommended-strict"],
  { files: ["tests/**"], ...pluginVitest.configs.recommended },
  {
    // 컴포넌트 테스트가 관심 없는 콜백 prop(onReset, onSortingChange 등)에 흔히 no-op을
    // 넘긴다 — `no-empty-function`을 화살표 함수에 한해서만 완화한다.
    files: ["tests/**"],
    rules: { "@typescript-eslint/no-empty-function": ["error", { allow: ["arrowFunctions", "methods"] }] },
  },
]);
