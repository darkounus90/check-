# E01-T8 · Esqueleto packages/verifier

## Goal
Contrato `Defense` + tipo `Verdict` placeholder; compila.

## Acceptance Criteria
- [x] `@check/verifier` compila y emite tipos.
- [x] Exporta `Verdict` (`verified`/`pending`/`suspicious`), `Defense` (`evaluate`), `DefenseSignal`, `VerificationContext`, y `defenseRegistry` (vacío).
- [x] Importa `Cents` de `@check/shared` — linkage cross-package verificado.
- [x] `"type": "module"` declarado (D8).

## Notes
- Implementado en `packages/verifier/`. Las 7 defensas reales, el semáforo y la regla dura "sin correo real, nunca 🟢" llegan en la Épica 6.
