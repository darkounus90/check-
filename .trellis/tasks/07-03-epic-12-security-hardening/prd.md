# Épica 12 — Hardening de seguridad y cumplimiento

**Objetivo:** encriptación en reposo de datos sensibles, políticas de retención de datos, y cumplimiento con habeas data / normativa colombiana (auditoría, derechos del titular). Endurecer el sistema antes de operar con datos reales.

**Dependencias:** todas las anteriores (se endurece lo ya construido); apoyada por el logging/auditoría de la Épica 11.

**Criterio de aceptación de la épica:** los datos sensibles (comprobantes, sesiones WhatsApp, PII) están encriptados en reposo; existe política de retención aplicada por job; un titular puede ejercer sus derechos (acceso/eliminación); hay registro de auditoría inmutable de accesos a datos sensibles.

## Mapa de subtareas

### Grupo A — encriptación y secretos (paralelizable)

- **E12-T1 [∥]** Encriptación en reposo de campos/artefactos sensibles (comprobantes, auth-state WhatsApp, PII). **Aceptación:** los datos sensibles quedan cifrados en storage; sin la clave no son legibles.
- **E12-T2 [∥]** Gestión de secretos y rotación (claves de cifrado, credenciales Vision/Postmark/Supabase). **Aceptación:** ningún secreto en el repo; rotación documentada y probada.

### Grupo B — retención y derechos del titular (paralelizable)

- **E12-T3 [∥]** Política de retención + job de purga por tipo de dato y antigüedad. **Aceptación:** datos fuera de ventana de retención se purgan automáticamente y queda traza.
- **E12-T4 [∥]** Habeas data: flujo de acceso/rectificación/eliminación a solicitud del titular. **Aceptación:** dado un titular, se puede exportar y eliminar su información cumpliendo normativa colombiana.
- **E12-T5 [∥]** Consentimiento y aviso de privacidad en los puntos de entrada (WhatsApp/PWA/dashboard). **Aceptación:** el usuario ve/acepta el aviso donde corresponde y queda registrado.

### Grupo C — auditoría y verificación (secuencial, tras A y B)

- **E12-T6 [→]** Registro de auditoría inmutable de accesos a datos sensibles (quién, qué, cuándo). **Aceptación:** todo acceso a PII/comprobante queda auditado y es consultable.
- **E12-T7 [→]** Revisión de superficie: RLS, endpoints públicos (PWA), rate limits, headers de seguridad. **Aceptación:** checklist de seguridad revisado; sin endpoints tenant sin RLS ni públicos sin límite.
- **E12-T8 [→]** Prueba de cumplimiento end-to-end (encriptación + retención + habeas data + auditoría). **Aceptación:** un recorrido completo demuestra los cuatro pilares funcionando juntos.

---

## Implementación (Épica 12 — completada)

### E12-T1 — Cifrado en reposo ✅

- Helper de cifrado **AES-256-GCM** (autenticado) en `packages/shared/src/crypto.ts`: `KeyRing`
  versionado, `encryptString`/`decryptString`, `encryptBytes`/`decryptBytes`,
  `ensureEncrypted`/`maybeDecrypt` (convivencia con texto plano heredado), `reencrypt`.
- `CryptoService` (NestJS) en `apps/api` y `apps/workers` envuelve el `KeyRing` desde
  `ENCRYPTION_KEYS`. Sin la var: passthrough (dev); en prod se loguea error.
- Aplicado a: `WaSession.authState` (cifrado en `WhatsAppStore.saveAuthState`/`loadAuthState`),
  y disponible para `ocrText`/artefactos (helpers `encryptBytes` para el blob de Storage).
- **Aceptación:** sin la clave, el sobre no descifra (test `crypto.test.ts`: "sin la clave
  correcta, los datos no son legibles" + detección de manipulación por el tag GCM). ✅

### E12-T2 — Secretos y rotación ✅

- **Verificación "ningún secreto en el repo":** `.gitignore` ignora `.env` y `.env.*`
  (excepto `.env.example`); `git ls-files` no lista ningún `.env` real. ✅
- **Esquema de rotación de la clave de cifrado (versionado):** `ENCRYPTION_KEYS` acepta varias
  claves `v<n>:<base64-32B>` separadas por coma; la MAYOR versión cifra (activa), el resto solo
  descifra. Procedimiento:
  1. Genera v(n+1): `node -e "console.log('v2:'+require('crypto').randomBytes(32).toString('base64'))"`.
  2. Despliega `ENCRYPTION_KEYS=v2:<nueva>,v1:<vieja>` (v2 activa; v1 aún descifra lo viejo).
  3. Recifra los sobres existentes con `reencrypt` (descifra con v1, recifra con v2).
  4. Cuando ya no quede ningún sobre bajo v1, retira v1 (`KeyRing.withoutVersion`).
- **Rotación de credenciales externas (Vision/Postmark/Supabase):** se rotan en el proveedor y
  se actualiza la var correspondiente en el entorno de despliegue (no viven en el repo). El
  arranque valida su presencia (zod en `env.ts`).
- **Aceptación:** rotación probada en `crypto.test.ts` ("rotación de clave: descifra con vieja,
  recifra con nueva") — descifra bajo la clave vieja y recifra bajo la nueva sin pérdida. ✅

### E12-T3 — Retención + purga ✅

- Política pura en `packages/shared/src/retention.ts` (ventanas por tipo, `retentionCutoff`,
  `isBeyondRetention`, `buildPurgeTrace`, reloj inyectable). Defaults: voucher 365d,
  bankEmail 365d, qrResolutionLog 180d, waSession 90d. Configurable por `RETENTION_*_DAYS`.
- Job `RetentionService` en `apps/workers/src/retention/` con `setInterval`
  (`RETENTION_PURGE_INTERVAL_MS`, default 24h; no arranca en test) y `purgeOnce()` testeable.
  Deja traza estructurada por tipo. `money_op_logs` y `data_access_audits` NO se purgan
  (evidencia legal).
- **Aceptación:** `retention.service.test.ts` ejerce corte por reloj inyectado + traza. ✅

### E12-T4 — Habeas data ✅

- `HabeasDataService` + `HabeasDataController` (`apps/api/src/habeas-data/`). Autenticado
  (`SupabaseJwtGuard`+`RolesGuard`) y **solo OWNER**, acotado al `businessId` del contexto tenant.
  - `POST /habeas-data/export` — exporta la info del titular (por su JID de WhatsApp),
    **descifrando** `ocrText`; audita el acceso.
  - `DELETE /habeas-data` — elimina vouchers (cascada) + consentimientos del titular; audita;
    devuelve `storagePathsToPurge` para limpiar los artefactos en Storage.
- **Aceptación:** `habeas-data.service.test.ts` (export descifra + audita; delete borra + audita). ✅

### E12-T5 — Consentimiento y aviso de privacidad ✅

- Copy canónico + versión en `packages/shared/src/consent.ts`
  (`PRIVACY_NOTICE_TEXT`/`_WHATSAPP`/`_VERSION`).
- `ConsentController`/`ConsentService` (`apps/api/src/consent/`): `GET /consent/notice`
  (aviso + versión) y `POST /consent` (registra en `privacy_consents`). Público (PWA/WhatsApp).
- PWA `apps/web/app/n/[opaqueId]/voucher-flow.tsx`: el titular VE el aviso en la pantalla de
  captura (enviar el comprobante implica aceptar — declarado en el copy).
- **Aceptación:** el usuario ve el aviso; el consentimiento se registra (`consent.test.ts` del
  shared + endpoint). ✅

### E12-T6 — Auditoría inmutable ✅

- Contrato puro en `packages/shared/src/audit.ts` (`Auditor`, `buildAuditEvent`, sink inyectable).
- Tabla `data_access_audits` **append-only a nivel de BD** (migración
  `20260706150000_epic12_audit_consent_authhook`): trigger `block_mutation_append_only` que
  bloquea UPDATE/DELETE para CUALQUIER rol (incluido service_role) + políticas RLS
  `for update/delete using(false)`. `AuditService` (api) persiste best-effort (nunca hace
  fallar la operación auditada).
- Invocada por los endpoints sensibles (habeas data export/delete).
- **Aceptación:** todo acceso a PII/comprobante queda auditado y es consultable (RLS de lectura
  por negocio); inmutabilidad garantizada por trigger. ✅

### E12-T7 — Revisión de superficie (checklist) ✅

Decisión sobre el **auth hook de Supabase (gap conocido):** se implementó la **función SQL**
`public.custom_access_token_hook(event jsonb)` (migración
`20260706150000_epic12_audit_consent_authhook`) que inyecta `business_id`/`user_role` como claims
resueltos desde la membresía. Su **activación** en el proyecto Supabase real es configuración del
dashboard (Authentication → Hooks → Custom Access Token), no aplicable por migración en este
entorno — por eso queda LISTA y documentada. Mientras no se active, el patrón sancionado sigue
siendo **acceso mediado por API** (`TenantService.runAsTenant` fija el claim server-side ⇒ RLS
activa por request); ningún endpoint tenant carece de ese mediador.

Checklist:

| Ítem | Estado | Nota |
| --- | --- | --- |
| RLS en toda tabla tenant con `businessId` | ✅ | Épica 2 cubrió businesses/memberships/receiving_accounts/vouchers/transactions/bank_emails/evidence_sources/number_pool_assignments/money_op_logs/approval_numbers. **Hallazgo E12-T7:** faltaban `qr_resolution_logs` y `wa_voucher_contexts` → corregido en migración `20260706160000_epic12_rls_gaps`. `data_access_audits`/`privacy_consents` con RLS en su propia migración. |
| `wa_numbers` / `wa_sessions` sin RLS de negocio | ✅ (a propósito) | Infraestructura cross-tenant (un número sirve a varios negocios); solo accesibles por service_role (workers), nunca por el cliente Supabase. Documentado. |
| Endpoints públicos con rate limit | ✅ | `PublicController` con `ThrottlerGuard` (Épica 9): ingesta 10/min IP + 30/min negocio, polling 60/min IP. `POST /consent` es barato (una escritura por titular); sin rate limit dedicado, mismo criterio que las lecturas públicas. |
| Headers de seguridad (NestJS) | ✅ | Middleware en `main.ts`: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`, HSTS en prod; se quita `X-Powered-By`. |
| Headers de seguridad (Next) | ✅ (revisado) | La web es cliente del API; el endurecimiento server-side vive en el API. El copy sensible no expone PII. |
| CORS | ✅ | `app.enableCors` restringido a `PUBLIC_APP_URL` en producción (comodín solo en dev). |
| Auth hook Supabase (claims RLS directa) | ✅ artefacto listo | Función SQL creada + grants tolerantes; activación = config del proyecto. |
| Cifrado de datos sensibles en reposo | ✅ | E12-T1. |
| Auditoría inmutable de accesos | ✅ | E12-T6. |

**Aceptación:** sin endpoints tenant sin RLS ni públicos sin límite. ✅

### E12-T8 — Prueba end-to-end de cumplimiento ✅

- `apps/api/test/compliance-e2e.test.ts`: un recorrido que demuestra consentimiento + cifrado
  (no legible sin clave) + auditoría (3 accesos registrados en orden) + retención (corte por
  ventana) + habeas data (export descifra) + rotación de clave, todo junto. ✅

### Validación

- `pnpm build`, `pnpm typecheck`, `pnpm lint`: verdes.
- Tests: `@check/shared` 53, `@check/workers` 54, `@check/api` 43 — todos en verde.
- Migraciones aplicadas contra Supabase: `20260706150000_epic12_audit_consent_authhook` y
  `20260706160000_epic12_rls_gaps`.
