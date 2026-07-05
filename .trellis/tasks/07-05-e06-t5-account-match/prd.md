# E06-T5 Defensa 3 - match cuenta destino

## Goal

Implementar la Defensa 3 del motor de verificación antifraude (Épica 6): comparar la
cuenta destino / beneficiario del comprobante extraído (OCR, Épica 5) contra lo
declarado por el negocio, con **match flexible** según la decisión D4
(`.trellis/spec/decisions.md`).

## Requirements

- Comparar `voucher.destinationAccount` / `voucher.beneficiary` (comprobante extraído)
  contra `DefenseContext.business.declaredAccountLast4` / `declaredBeneficiary`
  (config del negocio, ya definidos en el contrato `BusinessDefenseConfig` desde E06-T1;
  no fue necesario extender `types.ts`).
- Match por **últimos 4 dígitos de cuenta** y/o **nombre de beneficiario**
  (comparación flexible: normalización de minúsculas, acentos y espacios; coincidencia
  exacta o de subcadena tras normalizar).
- Si coincide (cuenta o beneficiario) → `pass`, suma confianza (`weight = 0.6 > 0`),
  **sin** `enablesGreen` (esa marca es exclusiva de la Defensa 1).
- Si el comprobante no trae dato legible de cuenta/beneficiario, o el negocio no tiene
  nada declarado para comparar → `not_applicable`. **Nunca penaliza** por sí sola
  (regla explícita D4).
- Si hay dato legible en ambos lados pero **no coincide** → `fail` (baja el veredicto:
  el agregador ya trata un `fail` sin `enablesGreen` como `SUSPICIOUS`).
- Implementar en `packages/verifier/src/defenses/account-match.ts`, exportando
  `accountMatchDefense: Defense`. No tocar `src/index.ts` ni `package.json`
  (integración final la hace E06-T10, para evitar conflictos con las 6 defensas
  paralelas del mismo Grupo B).

## Acceptance Criteria

- [x] Coincide por últimos 4 dígitos de cuenta → `pass`.
- [x] Coincide por nombre de beneficiario (match flexible/normalizado) → `pass`.
- [x] No coincide cuenta ni beneficiario (con datos legibles en ambos lados) → `fail`.
- [x] Sin dato legible de cuenta/beneficiario en el comprobante (o nada declarado por
      el negocio) → `not_applicable`, nunca `fail`.
- [x] `pnpm --filter @check/verifier build/typecheck/lint` pasan.
- [x] Tests nuevos (`test/defenses/account-match.test.ts`) pasan ejecutados
      directamente con `tsx --test` (no están cableados al script `test` de
      `package.json` porque ese archivo no se tocó; queda para E06-T10 agregar el
      glob de `test/defenses/**` al script).

## Notes

- No se agregó ningún campo a `types.ts`: `declaredAccountLast4` y `declaredBeneficiary`
  ya existían en `BusinessDefenseConfig` desde E06-T1, documentados explícitamente para
  esta defensa ("D4, Defensa 3").
- `weight = 0.6` es un valor de "confianza media" arbitrario (no exigido por el PRD);
  E06-T10 puede ajustarlo al cablear el umbral configurable real si se define uno.
