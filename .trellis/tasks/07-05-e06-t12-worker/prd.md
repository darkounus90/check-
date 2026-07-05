# E06-T12 Worker de verificacion

## Goal

Worker de verificación antifraude en `apps/workers` que consume el flujo end-to-end de
un comprobante: comprobante ya procesado por OCR (Épica 5) → contexto (correos
bancarios parseados, base global de números de aprobación, cuentas declaradas del
negocio) → 7 defensas reales del motor antifraude (`@check/verifier`, Épica 6, Grupo B
+ E06-T10) → veredicto persistido (`persistVerdict`, E06-T11). Si el veredicto queda
`PENDING`, reintenta dentro de la ventana de espera del correo real del banco receptor
(`retryPendingVerification`, E06-T2), resolviendo a `VERIFIED` (si el correo llega a
tiempo) o `SUSPICIOUS` (si la ventana expira sin correo).

## Requirements

- Cola BullMQ `verification-processing` (mismo patrón que `ocr-processing`, E05-T3):
  evaluación inicial de un `voucherId` y reintentos de veredictos `PENDING`,
  distinguidos por la presencia de `pendingSinceUtc` en el payload del job.
- Gatherer de contexto (`gatherVerificationContext`): arma `DefenseInput`/
  `DefenseContext` completo a partir de un `voucherId` — lee el `Voucher` ya extraído,
  las `ReceivingAccount` del negocio (Defensa 3), los `BankEmail` ya parseados
  (`status: PARSED`) dentro de una ventana alrededor del pago (Defensa 1), y consulta
  la base global de aprobaciones vía SQL crudo (`approval_number_exists`, Defensa 2).
- Procesador (`VerificationProcessorService`): corre `runDefenses(allDefenses, input)`,
  persiste con `persistVerdict` (reutilizado tal cual, sin reimplementar), y si el
  veredicto es `VERIFIED` registra el número de aprobación en la base global
  (`approval_number_register`) para detectar reutilizaciones futuras.
- Reintento: si el veredicto queda `PENDING`, se programa un job con `delay` en la
  misma cola; al ejecutarse, recalcula el contexto (el correo pudo haber llegado) y usa
  `retryPendingVerification` (`packages/verifier`) para decidir el estado final —
  reprograma otro reintento si sigue `PENDING` dentro de ventana, o persiste el
  resultado final (`VERIFIED`/`SUSPICIOUS`).
- Reloj inyectable (`VERIFICATION_CLOCK`) para que la lógica de negocio sea
  determinista/testeable, mismo principio que `nowUtc` en `packages/verifier`.
- `VerificationModule` ya registrado en `AppModule` (confirmado, no requirió cambios).
- Tests unitarios sin BullMQ/Redis real: el gatherer con Prisma fake/duck-typed, y el
  flujo completo con las 7 defensas reales (sin mocks) sobre al menos 2 escenarios
  (VERIFIED tras reintento con correo a tiempo; SUSPICIOUS tras expirar la ventana).

## Acceptance Criteria

- [x] Flujo end-to-end desde comprobante hasta veredicto persistido: `OcrService`
      encola la verificación al terminar el OCR con éxito
      (`VerificationQueueService.enqueueVerification`, vía `VERIFICATION_ENQUEUER`
      inyectado en `OcrModule`); el worker de verificación gatherer→defensas→persistencia
      corre sin intervención manual.
- [x] `pnpm --filter @check/workers build/typecheck/lint/test` pasa.
- [x] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (raíz del monorepo) pasa.

## Notes

### Diseño final

- `apps/workers/src/verification/verification.constants.ts`: nombre de cola
  (`verification-processing`), nombre de job (`verify`), token `VERIFICATION_CLOCK`.
- `verification.queue.ts`: `VerificationQueueService` (`enqueueVerification`,
  `scheduleRetry` con `delay`).
- `verification.context.ts`: `gatherVerificationContext` + tipos de los registros
  Prisma mínimos (`VerificationVoucherRecord`, `VerificationReceivingAccountRecord`,
  `VerificationBankEmailRecord`) — duck-typed, mismo patrón que `VoucherStore` de
  `ocr.service.ts`.
- `verification.approval-gateway.ts`: `ApprovalNumberGateway`
  (`exists`/`register`), implementación real `PrismaApprovalNumberGateway` sobre
  `prisma.$queryRaw` (funciones SQL `approval_number_exists`/`approval_number_register`,
  Épica 2/D6).
- `verification.processor.ts`: `VerificationProcessorService.process(voucherId)`
  (evaluación inicial) y `.retry(voucherId, pendingSinceUtc)` (reintento) — orquesta
  gatherer + `runDefenses` + `persistVerdict` + reintento/registro de aprobación.
- `verification.worker.ts`: consumer BullMQ que enruta el job a `process` o `retry`
  según el payload.
- `verification.module.ts`: registra todo lo anterior; exporta `VerificationService` y
  `VerificationQueueService` (esta última consumida por `OcrModule`).
- `ocr.service.ts`/`ocr.module.ts`: se decidió SÍ cablear el enganche OCR→verificación
  (en vez de posponerlo) porque es de bajo riesgo (un parámetro de constructor opcional
  con default no-op, no rompe tests existentes) y cierra el criterio de aceptación
  "flujo end-to-end" de la épica en producción, no solo en tests.

### Deuda explícita documentada en código

- **Identidad de cliente para intentos fallidos** (`recentFailedAttemptsByClient`):
  siempre `undefined` — no existe ningún canal con identidad de cliente todavía
  (WhatsApp es Épica 7, no implementada). La Defensa 7 ya trata `undefined` como 0
  intentos (no penaliza), documentado en `verification.context.ts`.
- **Campos de configuración de negocio**: `Business` (Prisma) no tiene columnas
  `verificationWindowMinutes`/`failedAttemptsThreshold`. Se usa un valor por defecto
  hardcodeado (`DEFAULT_VERIFICATION_WINDOW_MINUTES = 15`) en vez de agregar una
  migración, para mantener esta tarea acotada (mismo criterio que los defaults ya
  hardcodeados dentro de las propias defensas, ej. `DEFAULT_WINDOW_MINUTES` en
  `email-match.ts`). `failedAttemptsThreshold` se deja sin configurar a propósito: la
  Defensa 7 ya cae a su propio default.
- **`declaredBeneficiary`**: se puebla desde `ReceivingAccount.alias` (apodo de cuenta),
  la columna existente que más se le parece a un nombre declarado — no es
  necesariamente el nombre legal del beneficiario; no existe un campo dedicado en el
  schema hoy.
- **`imageBytes` no se puebla**: la Defensa 5 (análisis forense de imagen) siempre
  recibe `imageBytes: undefined` en este worker y emite `not_applicable` (no penaliza,
  D4). Requeriría re-descargar la imagen desde Storage en el worker de verificación;
  se pospuso para no ampliar el scope de esta tarea.

### Resultado de verificaciones

- `pnpm --filter @check/workers build` — OK.
- `pnpm --filter @check/workers typecheck` — OK.
- `pnpm --filter @check/workers lint` — OK.
- `pnpm --filter @check/workers test` — 22/22 tests OK (incluye
  `verification.context.test.ts` y `verification.processor.test.ts`, nuevos).
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (raíz) — OK, todos los
  paquetes del monorepo (9/9 build, 14/14 typecheck+lint, todos los test suites).
