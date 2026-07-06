# E12-T2 — Gestion de secretos y rotacion

**Objetivo:** ningún secreto en el repo; rotación de la clave de cifrado versionada y probada; rotación de credenciales externas documentada.

**Entregado:**
- Verificado: `.env`/`.env.*` gitignored; no hay `.env` real trackeado.
- Rotación con `ENCRYPTION_KEYS=v2:<nueva>,v1:<vieja>` + `reencrypt` + retiro de la vieja (`KeyRing.withoutVersion`).
- `.env.example` (raíz/api/workers) documenta formato y procedimiento.

**Aceptación:** rotación probada (descifra con vieja, recifra con nueva) en `crypto.test.ts`. ✅
