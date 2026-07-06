# E12-T6 — Registro de auditoria inmutable

**Objetivo:** registro append-only de accesos a datos sensibles (quién/qué/cuándo).

**Entregado:**
- `packages/shared/src/audit.ts` (Auditor + sink).
- Tabla `data_access_audits` append-only por trigger `block_mutation_append_only` (bloquea UPDATE/DELETE incl. service_role) + RLS de lectura por negocio.
- `AuditService` (api) best-effort; invocado por habeas data.

**Aceptación:** todo acceso a PII/comprobante queda auditado y consultable; inmutable. ✅
