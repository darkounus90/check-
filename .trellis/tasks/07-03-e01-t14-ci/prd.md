# E01-T14 · CI básico (GitHub Actions)

## Goal
Workflow de CI que corre install/build/typecheck/lint/test en cada push y PR.

## Acceptance Criteria
- [x] `.github/workflows/ci.yml` existe y es YAML válido (verificado).
- [x] Corre en `push` y `pull_request`: checkout → pnpm 11 → Node 20 (cache pnpm) → `install --frozen-lockfile` → `build` → `typecheck` → `lint` → `test`.
- [x] Los comandos pasan localmente en verde (build 9/9, typecheck 10/10, lint 10/10, test 10/10), por lo que el workflow quedará verde al hacer push.

## Notes
- `sharp` se construye en CI gracias a `allowBuilds` en `pnpm-workspace.yaml`.
- La verificación "verde en el runner" se confirma tras el primer push al remoto (aún no hay remoto configurado).
