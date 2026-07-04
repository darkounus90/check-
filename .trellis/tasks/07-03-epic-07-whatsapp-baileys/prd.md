# Épica 7 — Capa WhatsApp con Baileys

**Objetivo:** capa multi-número sobre Baileys con sesiones persistidas en Postgres, humanización anti-baneo, warmeo de números nuevos, pool con health checks y enrutador de instancias. El cliente envía el comprobante por WhatsApp y recibe el semáforo.

**Dependencias:** Épica 1 (`packages/whatsapp`), Épica 2 (`WaNumber`/`WaSession`/pool), Épica 5 y 6 (procesar comprobante y responder veredicto).

**Criterio de aceptación de la épica:** una instancia recibe una imagen por WhatsApp, la mete al pipeline y responde el semáforo con comportamiento humanizado; las sesiones sobreviven a reinicio (persistidas en Postgres); un número en warmeo respeta los límites de volumen; el pool reporta salud por número.

## Mapa de subtareas

### Grupo A — instancia base (secuencial)

- **E07-T1 [→]** Wrapper de instancia Baileys con auth-state persistido en Postgres (no en disco). **Aceptación:** una instancia se conecta, se reinicia el proceso y reconecta sin re-escanear QR.
- **E07-T2 [→]** Recepción de mensajes/imagenes → normalizar y encolar al pipeline OCR/verificación. **Aceptación:** una imagen enviada al número queda encolada como `Voucher`.
- **E07-T3 [→]** Envío de respuesta con el semáforo al cliente. **Aceptación:** el cliente recibe el veredicto en el chat.

### Grupo B — humanización y warmeo (paralelizable tras Grupo A)

- **E07-T4 [∥]** Módulo de humanización: delays 1–4s, "escribiendo…", leído con delay, presencia por horario del negocio. **Aceptación:** las respuestas exhiben estos patrones; sin outbound sin trigger.
- **E07-T5 [∥]** Rotación de 5–8 plantillas por tipo de respuesta, cero mensajes idénticos consecutivos. **Aceptación:** dos respuestas seguidas del mismo tipo nunca son idénticas.
- **E07-T6 [∥]** Motor de warmeo con escalado de volumen (día 1: 20/h, sem 2: 60/h, luego 200/h) y ventana de 2 semanas antes de entrar al pool. **Aceptación:** un número nuevo no supera su límite horario ni entra al pool antes de completar warmeo.

### Grupo C — pool, multi-tenant y cierre (secuencial, tras Grupo B)

- **E07-T7 [→]** Orquestador multi-instancia (levantar/bajar N números como procesos gestionados en `apps/workers`). **Aceptación:** varios números corren en paralelo de forma aislada.
- **E07-T8 [→]** Asignación multi-tenant número↔negocios (20–50 pequeños o 5–10 medianos) para acotar radio de daño. **Aceptación:** cada negocio resuelve a su grupo de números.
- **E07-T9 [→]** Health checks cada 60s por número (conectado/baneado/degradado) persistidos. **Aceptación:** el estado de cada número es consultable y se actualiza cada 60s.
- **E07-T10 [→]** Persistencia total de conversación/comprobante/sesión (sobrevive baneo). **Aceptación:** tras un baneo simulado, no se pierde ninguna conversación ni comprobante.
