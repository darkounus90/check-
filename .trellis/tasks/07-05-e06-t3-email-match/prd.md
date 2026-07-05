# E06-T3 Defensa 1 - cruce correo real

## Goal

Implementar la Defensa 1 del motor antifraude (Épica 6, Grupo B): cruzar el comprobante
extraído (`ExtractedVoucher`) contra los correos bancarios reales ya parseados
(`DefenseContext.receivedBankEmails: ParsedBankEmail[]`), para confirmar que la
transferencia efectivamente ocurrió según el banco receptor. Esta es la **única**
defensa de las 7 que debe emitir `enablesGreen: true` — regla dura de la épica: sin
esta defensa en `pass`, el veredicto nunca puede ser `VERIFIED` (🟢).

## Requirements

- Exportar `emailMatchDefense: Defense` desde `packages/verifier/src/defenses/email-match.ts`,
  implementando el contrato `Defense` de `../types.ts` (`kind` + `evaluate(input)`).
- `kind` elegido: `"bank_email_match"`.
- Criterios de match contra cada `ParsedBankEmail` candidato en `context.receivedBankEmails`:
  - Monto exacto (`voucher.amount === email.amount`, tipo `Cents`).
  - Número de aprobación exacto (`voucher.approvalNumber === email.approvalNumber`).
  - Cuenta destino exacta (`voucher.destinationAccount === email.destinationAccount`).
  - Ventana de tiempo entre `voucher.paidAtUtc` y `email.occurredAtUtc`: por defecto
    ±15 minutos, configurable por negocio vía
    `context.business.verificationWindowMinutes`.
- Si **algún** correo recibido matchea todos los criterios → `pass` con
  `enablesGreen: true` (usar `passSignal` de `../signal.ts`).
- Si **ningún** correo matchea (incluyendo el caso de lista vacía) → `fail` con
  `enablesGreen: true` (usar `failSignal`). No debe usarse `not_applicable`: la
  ausencia de correo real es la señal de fraude más fuerte del sistema (a diferencia
  de otras defensas donde un dato ilegible no penaliza, D4).
- No modificar `src/index.ts`, `package.json`, ni ningún archivo fuera de
  `src/defenses/email-match.ts` y `test/defenses/email-match.test.ts` (integración
  la hace E06-T10 en una tarea separada para evitar conflictos con las otras 6
  defensas del Grupo B trabajando en paralelo sobre el mismo package).
- Tests unitarios en `packages/verifier/test/defenses/email-match.test.ts` cubriendo:
  match exacto (pass + enablesGreen), monto distinto (fail), fuera de ventana (fail),
  sin correos (fail), ventana configurable distinta por negocio.

## Acceptance Criteria

- [x] `emailMatchDefense` implementado en `packages/verifier/src/defenses/email-match.ts`
      con `kind: "bank_email_match"`, cumpliendo el contrato `Defense`.
- [x] Match exacto (monto, aprobación, cuenta, dentro de ventana) → `pass` con
      `enablesGreen: true`.
- [x] Sin match (ningún correo, o monto/aprobación/cuenta/ventana distintos) → `fail`
      con `enablesGreen: true` (nunca `not_applicable`). **Superseded por E06-T10:**
      esta regla original trataba "lista de correos vacía" igual que "correo que no
      matchea" (ambos `fail`). En la integración final (E06-T10, ver su `prd.md`,
      sección "Decisiones de producto") se distinguió explícitamente ambos casos:
      lista vacía ahora es `not_applicable` (→ `PENDING`, se reintenta en la ventana
      de espera), y solo "llegó correo pero no matchea" sigue siendo `fail`
      (→ `SUSPICIOUS`). El código y los tests de `email-match.ts`/`email-match.test.ts`
      reflejan la versión final (post-T10); este criterio queda documentado tal como
      se aceptó originalmente en T3, por trazabilidad histórica.
- [x] Ventana de tiempo configurable por negocio (`verificationWindowMinutes`),
      default 15 minutos.
- [x] Tests en `test/defenses/email-match.test.ts` cubriendo los casos del Requirements.
- [x] `pnpm --filter @check/verifier build/typecheck/lint` pasan sin tocar `package.json`.
- [x] Tests del archivo nuevo verificados directamente con `tsx --test` (no incluidos aún
      en el script `test` de `package.json`, que lista archivos explícitos — pendiente
      de que la integración (E06-T10) los agregue).

## Notes

- `context.receivedBankEmails` puede tener más de un correo candidato; basta con que
  uno matchee todos los criterios.
- El `nowUtc` de `DefenseContext` no se usa aquí: la ventana de esta defensa compara
  `voucher.paidAtUtc` vs `email.occurredAtUtc` (dos timestamps de la transacción), no
  contra el reloj actual — eso es responsabilidad de la Defensa 4 (E06-T6).
