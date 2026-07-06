# E12-T1 — Cifrado en reposo de datos sensibles

**Objetivo:** cifrar en reposo campos/artefactos sensibles (ocrText, WaSession.authState, PII, comprobante) con cifrado autenticado (AES-256-GCM) y clave de env.

**Entregado:**
- `packages/shared/src/crypto.ts` (KeyRing versionado; encrypt/decrypt string/bytes; ensureEncrypted/maybeDecrypt; reencrypt).
- `CryptoService` en apps/api y apps/workers (env `ENCRYPTION_KEYS`).
- Cifrado aplicado a `WaSession.authState` en `WhatsAppStore`; helpers `encryptBytes` para el artefacto de Storage.

**Aceptación:** sin la clave los datos no son legibles ni manipulables (test round-trip + manipulación en `crypto.test.ts`). ✅
