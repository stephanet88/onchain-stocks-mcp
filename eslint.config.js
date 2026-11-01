import js from "@eslint/js";
import tseslint from "typescript-eslint";

// type-aware rules load the whole TypeScript program, too heavy for the 1 GB VM: tsc covers types
export default tseslint.config(
  { ignores: ["node_modules/", "dist/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
);
