# Épica 9 — PWA de fallback / entrada web

**Objetivo:** una PWA simple (en `apps/web`) donde el cliente, sin login, sube el comprobante y ve el resultado en la misma pantalla. Es el destino del fallback de la Épica 8 y una entrada web independiente.

**Dependencias:** Épica 1 (`apps/web`), Épica 5/6 (procesamiento y veredicto). Se integra con Épica 8 como fallback.

**Criterio de aceptación de la épica:** un cliente abre `<dominio>/n/{opaqueId}` (dominio configurable, ID opaco — D1–D3) sin pool, sube una foto/PDF sin autenticarse, y ve el semáforo actualizándose (🟡→🟢/🚨) en la misma pantalla; funciona en móvil e instalable como PWA.

## Mapa de subtareas

### Grupo A — esqueleto PWA (secuencial)

- **E09-T1 [→]** Ruta pública `/n/{opaqueId}` sin login + manifest + service worker (instalable). **Aceptación:** la página carga sin sesión y pasa criterios básicos de PWA (installable, offline shell); el `opaqueId` no es enumerable.
- **E09-T2 [→]** Identificación del negocio por la URL para asociar el comprobante. **Aceptación:** el comprobante subido queda ligado al negocio correcto sin login.

### Grupo B — flujo de subida y resultado (paralelizable tras Grupo A)

- **E09-T3 [∥]** Componente de captura/subida (cámara o archivo, imagen y PDF). **Aceptación:** se sube foto/PDF desde móvil; validación de tipo/tamaño.
- **E09-T4 [∥]** Endpoint público de ingesta que encola el comprobante al mismo pipeline. **Aceptación:** el archivo entra al pipeline OCR/verificación igual que por WhatsApp.
- **E09-T5 [∥]** Vista de resultado en la misma pantalla con estado en vivo 🟡→🟢/🚨 (polling o Realtime). **Aceptación:** el usuario ve el semáforo cambiar sin recargar.

### Grupo C — robustez y cierre (secuencial, tras Grupo B)

- **E09-T6 [→]** Estados de error/reintento (foto mala → "sube mejor foto", timeouts). **Aceptación:** una foto ilegible pide reintento; no muestra falso 🚨.
- **E09-T7 [→]** Anti-abuso básico en el endpoint público (rate limit por negocio/IP). **Aceptación:** un flood se limita sin afectar uso legítimo.
