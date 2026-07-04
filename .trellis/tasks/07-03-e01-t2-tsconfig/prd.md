# E01-T2 · TSConfig estricto compartido

## Goal

Crear la config base de TypeScript estricta que todos los packages/apps del monorepo extenderán, de modo que el `strict` real y las reglas de seguridad vivan en un solo lugar. Sin código de negocio; solo la base + una verificación de que "extiende y compila".

## Requirements

- `tsconfig.base.json` en la raíz con al menos:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `noImplicitOverride: true`
  - `noFallthroughCasesInSwitch: true`, `forceConsistentCasingInFileNames: true`
  - `esModuleInterop`, `skipLibCheck`, `resolveJsonModule`, `isolatedModules`
  - `target`/`lib` modernos (ES2022+), `moduleResolution` compatible con NodeNext/Bundler
  - `declaration: true`, `sourceMap: true` (para packages que emiten tipos)
- `tsconfig.json` raíz que extienda la base (para editor/IDE), sin incluir archivos aún.
- Añadir `typescript` como devDependency raíz (versión pinneada).
- Prueba de humo: un `tsconfig` de ejemplo que extienda la base y un `.ts` mínimo que **compile** con `tsc --noEmit`, y que **falle** si se viola una regla estricta (evidencia de que strict está activo). La prueba de humo se elimina al terminar (no ensucia el repo).

## Acceptance Criteria

- [x] `tsconfig.base.json` existe y es JSON válido con `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- [x] `pnpm exec tsc --noEmit` sobre un archivo correcto que usa la base pasa (exit 0).
- [x] Un archivo que viola `noUncheckedIndexedAccess` **falla** la compilación (TS2322 — evidencia de strict activo).
- [x] `typescript@^5.9.3` queda en devDependencies de la raíz.

**Aprendizaje:** con `module: NodeNext` + `verbatimModuleSyntax`, todo package/app **debe** declarar `"type": "module"` en su `package.json` (si no, TS1287). Aplica a T4–T12. Registrado en `.trellis/spec/decisions.md` (D8).

## Notes

- No configurar ESLint/Prettier aquí (es T3).
- Los packages reales (T4–T9) y apps (T10–T12) crearán su propio `tsconfig.json` con `extends: "../../tsconfig.base.json"`; esta tarea solo provee la base y demuestra que funciona.
- Dependencia: T1 (workspace). Bloquea a T4–T12 (todos extienden esta base).
