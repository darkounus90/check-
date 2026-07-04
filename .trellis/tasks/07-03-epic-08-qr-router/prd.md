# Épica 8 — Enrutador de QR estable

**Objetivo:** el QR físico contiene `<dominio>/n/{opaqueId}` — dominio configurable, `opaqueId` no adivinable (D1–D3). El enrutador resuelve al número sano en el momento del escaneo, hace failover automático si el primario cae, y cae a la PWA web cuando todo el pool del negocio está caído. Transparente para el cliente.

**Dependencias:** Épica 7 (pool + health checks), Épica 2 (asignación número↔negocio). El fallback consume la Épica 9 (PWA).

**Criterio de aceptación de la épica:** escanear `check.co/n/{negocio}` abre WhatsApp con un número sano; si el primario está caído, redirige al secundario sin intervención; si todos están caídos, redirige a la PWA; toda resolución queda registrada.

## Mapa de subtareas

### Grupo A — resolución base (secuencial)

- **E08-T1 [→]** Endpoint `GET /n/{opaqueId}` que resuelve al número activo y redirige a `wa.me`/deep-link. **Aceptación:** un escaneo abre WhatsApp con el número asignado sano; el `opaqueId` no es enumerable.
- **E08-T2 [→]** Selección de número sano usando health checks del pool (Épica 7). **Aceptación:** nunca resuelve a un número marcado caído/baneado.

### Grupo B — resiliencia (paralelizable tras Grupo A)

- **E08-T3 [∥]** Failover automático a número secundario cuando el primario está caído. **Aceptación:** con el primario caído, la siguiente resolución usa el secundario transparente.
- **E08-T4 [∥]** Fallback a PWA (`check.co/n/{negocio}` → PWA) cuando todo el pool del negocio está caído. **Aceptación:** sin números sanos, el cliente aterriza en la PWA de la Épica 9.
- **E08-T5 [∥]** Registro/analítica de cada resolución (número elegido, motivo, fallback usado). **Aceptación:** cada escaneo deja traza consultable para operación.

### Grupo C — generación de QR y cierre (secuencial, tras Grupo B)

- **E08-T6 [→]** Generación del QR/URL corta por negocio para imprimir. **Aceptación:** cada negocio obtiene su QR estable descargable que apunta a su ruta.
- **E08-T7 [→]** Test de continuidad: primario→secundario→PWA en cadena. **Aceptación:** simulando caídas escalonadas, el cliente siempre llega a un canal funcional (cero downtime percibido).
