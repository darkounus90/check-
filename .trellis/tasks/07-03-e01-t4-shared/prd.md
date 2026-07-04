# E01-T4 · Esqueleto packages/shared

## Goal
Tipos, placeholder de schemas Zod y utilidades compartidas; compila y es consumible por otros packages.

## Acceptance Criteria
- [x] `@check/shared` compila (`tsc`) y emite `dist/index.d.ts`.
- [x] Exporta `Cents` (entero centavos, marca de tipo), `toCents`, `CentsSchema` (Zod), `Result`/`ok`/`err`, `DISPLAY_TIMEZONE = "America/Bogota"`.
- [x] Consumible desde otro package (verificado: `@check/verifier` importa `Cents`).
- [x] `"type": "module"` declarado (D8).

## Notes
- Implementado en `packages/shared/`. Verificado con `pnpm build/typecheck/lint` (verde).
- Refleja convenciones del PRD: dinero en centavos entero, fechas UTC → mostrar en Bogotá.
