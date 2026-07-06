# E12-T5 — Consentimiento y aviso de privacidad

**Objetivo:** aviso/consentimiento en puntos de entrada (PWA/dashboard/WhatsApp) con registro.

**Entregado:**
- `packages/shared/src/consent.ts` (copy + versión + buildConsentRecord).
- `ConsentController`/`Service` (apps/api): `GET /consent/notice`, `POST /consent` → tabla `privacy_consents`.
- PWA `voucher-flow.tsx`: el titular ve el aviso antes de enviar.

**Aceptación:** el usuario ve/acepta el aviso y queda registrado. ✅
