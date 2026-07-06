# E12-T8 — Prueba end-to-end de cumplimiento

**Objetivo:** un test que demuestre cifrado + retención + habeas data + auditoría juntos.

**Entregado:**
- `apps/api/test/compliance-e2e.test.ts`: consentimiento + cifrado (no legible sin clave) + auditoría (3 accesos en orden) + retención (corte) + habeas data (export descifra) + rotación.

**Aceptación:** un recorrido completo demuestra los cuatro pilares. ✅
