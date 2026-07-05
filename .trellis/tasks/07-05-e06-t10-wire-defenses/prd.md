# E06-T10 Cablear defensas + regla dura

## Goal

Integrar las 7 defensas reales del Grupo B (E06-T3..T9) — implementadas en paralelo
sin tocar `index.ts`/`package.json` a propósito — al agregador (`runDefenses`) del
motor de verificación antifraude, y garantizar que la regla dura de la Épica 6 se
cumple en el sistema completo, no solo en aislamiento por defensa: **sin cruce con
correo real del banco receptor (Defensa 1), el veredicto nunca es `VERIFIED` (🟢)**.

## Requirements

- Confirmar que `packages/verifier/src/types.ts` no tiene conflictos ni contenido
  duplicado/inconsistente tras las 7 ediciones aditivas en paralelo.
- Exportar desde `src/index.ts` las 7 defensas reales (`emailMatchDefense`,
  `globalApprovalsDefense`, `accountMatchDefense`, `timeWindowDefense`,
  `imageForensicsDefense`, `structuralDefense`, `suspiciousPatternsDefense`) junto
  con sus constantes de `kind` exportadas, sin romper los exports existentes de
  E06-T1/T2.
- Crear un registro `allDefenses: readonly Defense[]` (en `src/registry.ts`,
  reexportado desde `index.ts`) con las 7 defensas, para que el worker (E06-T12)
  ejecute `runDefenses(allDefenses, input)`.
- Arreglar el script `test` de `package.json` para que corra todos los tests
  (los 2 de T1/T2 + los 7 de `test/defenses/`) sin tener que listar archivos a mano
  cada vez que se agregue una defensa nueva.
- Confirmar que las dependencias `exifr`/`sharp` (agregadas por E06-T7) están
  declaradas en `package.json`.
- Corregir errores de orden de imports (`simple-import-sort`) detectados en
  `test/defenses/account-match.test.ts` y `test/defenses/email-match.test.ts`.
- Escribir un test de integración (`test/wire-defenses.test.ts`) que corra
  `runDefenses(allDefenses, input)` con las 7 defensas reales (sin mocks) sobre
  varios escenarios construidos a mano, verificando explícitamente la regla dura.
- Decidir y documentar el comportamiento de `emailMatchDefense` (Defensa 1) cuando
  todavía no ha llegado ningún correo, distinguiéndolo del caso en que llegó un
  correo que no coincide con el comprobante (ver Decisiones de producto abajo).

## Decisiones de producto

- **Aún no ha llegado ningún correo del banco receptor** (`receivedBankEmails`
  vacío): no es evidencia de fraude, es una cuestión de timing. `emailMatchDefense`
  ahora emite `not_applicable` (en vez de `fail`) conservando `enablesGreen: true`,
  de modo que el agregador produce `PENDING` — el estado que la máquina de estados
  (E06-T2, `state-machine.ts`) ya sabe reintentar dentro de la ventana de espera —
  y nunca `SUSPICIOUS` solo por no haber llegado el correo todavía.
- **Llegó al menos un correo pero ninguno coincide** con el comprobante (monto,
  número de aprobación, cuenta destino o ventana de tiempo): es una señal fuerte de
  fraude (comprobante falso o alterado frente a lo que el banco realmente reportó).
  `emailMatchDefense` sigue emitiendo `fail` en este caso, y el agregador
  (`aggregate.ts`, regla "cualquier fail gana") produce `SUSPICIOUS` directo.

## Acceptance Criteria

- [x] `types.ts` compila sin conflictos ni contenido duplicado (revisado: los
      campos aditivos de E06-T1 y E06-T9 conviven sin problema).
- [x] `src/index.ts` exporta las 7 defensas, sus constantes de `kind` exportadas,
      y `allDefenses` desde `src/registry.ts`.
- [x] `package.json` de `@check/verifier` incluye `exifr`/`sharp` en
      `dependencies` y el script `test` corre todos los tests (2 + 7 + 1 de
      integración) vía glob (`tsx --test "test/**/*.test.ts"`), sin necesidad de
      editarlo al agregar defensas futuras.
- [x] Errores de orden de imports (`simple-import-sort`) en
      `test/defenses/account-match.test.ts` y `test/defenses/email-match.test.ts`
      corregidos; `eslint test src` sin errores.
- [x] `test/wire-defenses.test.ts` corre las 7 defensas reales (sin mocks) y
      **ningún escenario produce `VERIFIED` sin que la Defensa 1 (correo real)
      haya pasado** (`bank_email_match` en `pass`), incluyendo: comprobante limpio
      con correo real matcheando + resto de defensas en orden → `VERIFIED`; número
      de aprobación reutilizado (Defensa 2 falla) aunque el correo matchee →
      `SUSPICIOUS`; sin correo real todavía pero todo lo demás perfecto →
      `PENDING` (nunca `VERIFIED`); correo recibido que no coincide → `SUSPICIOUS`.
- [x] `pnpm --filter @check/verifier build/typecheck/lint/test` pasa.
- [x] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (raíz del monorepo)
      pasa.

## Notes

- No se modificó el contrato (`types.ts`) ni la lógica de agregación
  (`aggregate.ts`) — solo se cableó el registro y se ajustó `emailMatchDefense`
  para distinguir "aún no llega el correo" de "correo no coincide" (ver Decisiones
  de producto).
