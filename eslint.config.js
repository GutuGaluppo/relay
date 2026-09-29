import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/target/**",
      "**/.expo/**",
      "apps/desktop/src-tauri/gen/**",
      "apps/mobile/ios/**",
      "apps/mobile/android/**",
      "**/*.config.js",
      "**/babel.config.js",
      "**/metro.config.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
