import tseslint from "typescript-eslint";
export default tseslint.config({ ignores: ["public", "node_modules", ".wrangler"] }, ...tseslint.configs.recommended);
