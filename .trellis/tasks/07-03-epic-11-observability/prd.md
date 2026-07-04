# Épica 11 — Observabilidad, logs y alertas operacionales

**Objetivo:** logging estructurado transversal, cola de alertas (errores nunca silenciados), y alertas operacionales al equipo interno: baneos de números, parsers que dejan de matchear, colas atascadas.

**Dependencias:** transversal; consume señales de Épicas 4 (parsers), 6 (verificación), 7 (WhatsApp) y la infraestructura de colas de la Épica 1.

**Criterio de aceptación de la épica:** cada error llega a la cola de alertas (ninguno se silencia); un baneo de número, un parser que rompe y una cola atascada disparan alerta al canal del equipo con contexto suficiente para actuar; existen métricas básicas de salud.

## Mapa de subtareas

### Grupo A — fundación (secuencial)

- **E11-T1 [→]** Logger estructurado compartido (`packages/shared`) con correlación por `businessId`/`transactionId`. **Aceptación:** todos los servicios loguean en formato estructurado consultable.
- **E11-T2 [→]** Cola de alertas + despachador a Slack/Discord/email. **Aceptación:** un evento de alerta llega al canal configurado; el envío se reintenta ante fallo.

### Grupo B — alertas específicas (paralelizable tras Grupo A)

- **E11-T3 [∥]** Alerta de baneo de número WhatsApp con contexto (qué número, cuántos negocios afectaba, reemplazo, necesidad de warmeo). **Aceptación:** un baneo simulado dispara la alerta con todo el contexto.
- **E11-T4 [∥]** Alerta de parser que deja de matchear (correo o comprobante con formato no reconocido, tasa de fallo por banco). **Aceptación:** una tanda de correos no parseados dispara alerta indicando banco/versión.
- **E11-T5 [∥]** Alerta de colas atascadas (BullMQ: backlog, jobs fallidos, edad del job). **Aceptación:** un backlog simulado sobre umbral dispara alerta.
- **E11-T6 [∥]** Captura global: errores no manejados → cola de alertas (nunca silenciados). **Aceptación:** un throw no manejado en un worker termina como alerta, no como silencio.

### Grupo C — métricas y cierre (secuencial, tras Grupo B)

- **E11-T7 [→]** Métricas básicas de salud (tiempo a veredicto, tasa de parseo por banco, uptime del canal). **Aceptación:** las métricas de las success-metrics del PRD son observables.
- **E11-T8 [→]** Endpoints de health/readiness por app para monitoreo externo. **Aceptación:** `api` y `workers` exponen health consumible por el hosting.
