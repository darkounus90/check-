# E06-T11 Escritura MoneyOpLog inmutable

## Goal

Persistir el `Verdict` que produce el agregador de `@check/verifier` (`runDefenses`/`aggregateSignals`) en la base de datos: actualizar la `Transaction` correspondiente, guardar sus `EvidenceSource` y dejar una entrada nueva (append-only) en `MoneyOpLog` con `businessId`, `transactionId`, `verdict` y `evidenceSources`.

Contexto: Épica 6 (motor de verificación antifraude), Grupo C — integración y cierre. Depende de E06-T1 (contrato `Defense`/`Verdict`) y E06-T10 (cableado real de las 7 defensas). Precede a E06-T12 (worker de verificación en `apps/workers`, que invocará esta pieza de persistencia).

## Requirements

- Función `persistVerdict({ prisma, businessId, voucherId, amountCents, approvalNumber?, verdict, nowUtc? })` en `apps/workers/src/verification/verification.service.ts`.
- Dentro de una única `prisma.$transaction` (todo o nada):
  1. `upsert` de `Transaction` por `voucherId` (clave única existente en el schema): crea si no existe, o actualiza `verdict`, `amountCents`, `approvalNumber` y `resolvedAt` si ya existe. `resolvedAt` se fija a `nowUtc` (o al reloj real si no se inyecta) únicamente cuando `verdict.status !== "PENDING"`; si el estado es `PENDING`, `resolvedAt` queda/vuelve a `null`.
  2. Reemplaza las `EvidenceSource` de esa `Transaction`: borra las existentes para ese `transactionId` y crea una fila nueva por cada elemento de `verdict.evidenceSources` (`kind`, `passed`, `detail`). Esto mantiene `Transaction.evidenceSources` como la "foto" más reciente del estado de la operación.
  3. Inserta una fila **nueva** en `MoneyOpLog` (nunca actualiza una existente) con el snapshot completo del veredicto (`businessId`, `transactionId`, `verdict.status`, `evidenceSources` como JSON). Cada llamada a `persistVerdict` dentro del ciclo de vida de una transacción (incluyendo reintentos que la hacen evolucionar de `PENDING` a `VERIFIED`/`SUSPICIOUS`) agrega una fila nueva — es el log inmutable/append-only de la operación.
- Mapeo `DefenseSignal.outcome` → `EvidenceSource.passed`: ya resuelto aguas arriba en `packages/verifier/src/aggregate.ts` (`aggregateSignals`), donde `passed: signal.outcome !== "fail"` — es decir, tanto `"pass"` como `"not_applicable"` se guardan como `passed: true` (D4: "no aplica" no penaliza y no debe leerse como una falla en la auditoría). El matiz de `"not_applicable"` se preserva en `EvidenceSource.detail` (texto legible), no en la columna `passed`. `persistVerdict` recibe `verdict.evidenceSources` ya en esta forma (`{ kind, passed, detail? }`) y los persiste sin transformación adicional.
- Interfaces mínimas duck-typed (`VerificationStore`, análogo a `VoucherStore` en `apps/workers/src/ocr/ocr.service.ts`) para que el Prisma real (`PrismaService`) las satisfaga estructuralmente y los tests unitarios puedan usar un fake en memoria, sin Prisma real ni BD real.
- `VerificationService` (`@Injectable`, patrón `OcrService`) envuelve `persistVerdict` para inyección en el futuro worker (E06-T12) vía `VerificationModule`.
- Idempotencia/concurrencia: una sola llamada a `persistVerdict` es atómica (una transacción de BD). No se garantiza deduplicación entre llamadas **concurrentes** para el mismo `voucherId` (podrían producirse dos filas de `MoneyOpLog` para el mismo instante si dos verificaciones corren en paralelo sobre el mismo comprobante) — se documenta como aceptable para el MVP; la serialización por `voucherId` (ej. vía `jobId` de BullMQ) es responsabilidad del worker (E06-T12).

## Acceptance Criteria

- [x] Cada veredicto (`Verdict`) persistido deja exactamente una entrada nueva y auditable en `MoneyOpLog`, con `businessId`, `transactionId`, `verdict` y `evidenceSources`.
- [x] Un reintento que hace evolucionar el veredicto de `PENDING` a `VERIFIED`/`SUSPICIOUS` agrega una fila **nueva** en `MoneyOpLog`, nunca actualiza la anterior (append-only).
- [x] `Transaction.verdict`/`resolvedAt` y sus `EvidenceSource` quedan actualizados a la última evaluación.
- [x] La escritura de `Transaction` + `EvidenceSource` + `MoneyOpLog` ocurre en una única transacción de Prisma (todo o nada).
- [x] Tests unitarios con Prisma fake/duck-typed (sin BD real) cubren: creación inicial, reintento `PENDING`→`VERIFIED`, veredicto `SUSPICIOUS`, y que cada llamada crea una fila nueva en `MoneyOpLog`.
- [x] `pnpm --filter @check/workers build/typecheck/lint/test` y `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (raíz) pasan.

## Notes

- Ubicación: `apps/workers/src/verification/` (nuevo módulo). No modifica el schema Prisma (`packages/database/prisma/schema.prisma`), que ya tiene los modelos completos.
- No incluye worker/cola BullMQ — eso es E06-T12, la siguiente tarea, que invocará `VerificationService.persistVerdict`.
