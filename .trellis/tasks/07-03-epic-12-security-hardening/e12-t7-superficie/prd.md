# E12-T7 — Revision de superficie de seguridad

**Objetivo:** RLS por tabla tenant, públicos con rate limit, headers de seguridad, CORS; checklist con hallazgos.

**Entregado:**
- Hallazgo: faltaba RLS en `qr_resolution_logs` y `wa_voucher_contexts` → corregido (migración `20260706160000_epic12_rls_gaps`).
- Headers de seguridad + CORS restringido en `apps/api/src/main.ts`.
- Auth hook Supabase: función SQL `custom_access_token_hook` LISTA (activación = config del proyecto); patrón vigente = acceso mediado por API.
- Checklist completo en el prd de la épica.

**Aceptación:** sin endpoints tenant sin RLS ni públicos sin límite. ✅
