# E01-T3 · ESLint + Prettier + import order

## Goal

Configurar el tooling de calidad transversal del monorepo: ESLint 9 (flat config) con typescript-eslint, Prettier, y ordenamiento de imports, de modo que `pnpm lint` corra en toda la raíz sin error. Config compartida en la raíz que los packages/apps reutilizarán.

## Requirements

- ESLint 9 con **flat config** (`eslint.config.mjs`) en la raíz:
  - `@eslint/js` recomendado + `typescript-eslint` (type-aware donde aplique).
  - Ordenamiento de imports (`eslint-plugin-import` o el orden de `perfectionist`/`simple-import-sort`).
  - Integración con Prettier (`eslint-config-prettier` para apagar reglas de formato).
  - `ignores` para `node_modules`, `dist`, `.next`, `.turbo`, `coverage`, `**/generated`.
- Prettier configurado (`.prettierrc.json` + `.prettierignore`).
- Scripts raíz: `lint` (ya delega a turbo) y un `lint:root` / `format` que corran ESLint y Prettier directamente.
- devDependencies pinneadas: `eslint`, `typescript-eslint`, `@eslint/js`, `prettier`, `eslint-config-prettier`, plugin de import order.
- Prueba de humo: un `.ts` con imports desordenados **falla** el lint; ordenado y formateado **pasa**. Se elimina al terminar.

## Acceptance Criteria

- [x] `pnpm exec eslint .` corre en la raíz sin crashear y sin errores (exit 0).
- [x] `pnpm exec prettier --check .` corre sin error sobre los archivos versionados.
- [x] Un archivo con imports desordenados es reportado por ESLint (`simple-import-sort/imports`) y `--fix` lo ordena (builtins `node:` → externos).
- [x] Config es flat (`eslint.config.mjs`) y reutilizable por packages/apps.

**Nota:** `.trellis/` se añadió a `.prettierignore` para no reformatear los docs de Trellis (el PRD debe quedar verbatim).

## Notes

- No lintar código de negocio (aún no existe); el objetivo es dejar el tooling listo y verde.
- Dependencia: T1 (workspace), T2 (tsconfig base para reglas type-aware). Complementa el Grupo A.
- `.vscode/extensions.json` opcional recomendando ESLint/Prettier (permitido por `.gitignore`).
