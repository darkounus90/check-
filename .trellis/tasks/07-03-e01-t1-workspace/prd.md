# E01-T1 · Workspace pnpm + Turborepo

## Goal

Dejar la raíz del monorepo inicializada con pnpm workspaces + Turborepo, de modo que `pnpm install` corra limpio y `turbo` reconozca los pipelines `build`, `lint`, `typecheck`, `test`. **Sin** apps ni packages reales todavía (eso son T4–T12); esta tarea es solo el andamiaje raíz.

## Requirements

- `package.json` raíz privado (`"private": true`), con `packageManager` fijado a pnpm y `engines.node >= 20`.
- `pnpm-workspace.yaml` que declare `apps/*` y `packages/*` como workspaces.
- `turbo.json` con tasks `build`, `lint`, `typecheck`, `test` (dependsOn `^build` donde aplique, outputs razonables, `test`/`lint`/`typecheck` sin cache falso).
- Scripts raíz que deleguen a turbo: `build`, `lint`, `typecheck`, `test`, `dev`.
- Turborepo instalado como devDependency (versión pinneada).
- `.gitignore` (node_modules, dist, .turbo, .env, coverage, .next, etc.).
- `.npmrc` con settings de pnpm razonables para monorepo.
- `.nvmrc` (o `engines`) fijando la línea de Node objetivo (20+).
- Directorios `apps/` y `packages/` existen (con `.gitkeep` si están vacíos) para que el glob de workspaces resuelva.

## Acceptance Criteria

- [x] `pnpm install` corre sin error en una raíz limpia. _(turbo 2.10.2, Done in 3.2s)_
- [x] `pnpm exec turbo run build lint typecheck test --dry` reconoce los 4 pipelines sin crashear (exit 0; sin paquetes aún, esperado).
- [x] `pnpm-workspace.yaml`, `turbo.json`, `package.json`, `.gitignore`, `.npmrc` existen y son válidos (JSON/globs verificados).
- [x] No hay `package-lock.json` ni `yarn.lock`; solo `pnpm-lock.yaml`.

## Notes

- No implementar TS estricto aquí (es T2) ni ESLint/Prettier (es T3); solo dejar los tasks declarados en turbo.
- Node local es 24.14; se fija `engines >= 20` para no bloquear.
- Dependencia: ninguna. Bloquea al resto de la Épica 1.
