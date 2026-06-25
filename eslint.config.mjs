import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.astro/**",
      "**/.vercel/**",
      "**/node_modules/**",
      "**/coverage/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  }
);
