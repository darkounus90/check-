# PRD — CHECK

## Problema

Los negocios colombianos que aceptan pagos por transferencia (Nequi, Bancolombia, Daviplata, Davivienda, BBVA y otros) pierden dinero por comprobantes falsos: capturas editadas con Photoshop, comprobantes viejos reutilizados, apps clonadas que imitan la pantalla del banco emisor, y comprobantes con monto, cuenta destino o beneficiario alterados. Hoy el cajero verifica con los ojos, y los ojos son fáciles de engañar. Esto genera pérdidas directas y desconfianza al recibir pagos digitales.

## Propuesta de valor

CHECK verifica en segundos, contra una fuente independiente e imposible de falsificar (el correo transaccional real que el banco del negocio envía al recibir la transferencia), si un comprobante corresponde a un pago que efectivamente llegó a la cuenta del negocio. Le dice al cajero, con un semáforo claro: entrega, espera o no entregues.

## Usuarios

- **Cajero / vendedor:** recibe el pago, envía o recibe el comprobante, obtiene un veredicto en segundos.
- **Dueño del negocio:** configura las cuentas receptoras y el reenvío de correo bancario una sola vez; ve el histórico, las alertas y los intentos sospechosos.

## Realidad del ecosistema (asunciones de base)

- Los negocios reciben mayoritariamente en cuentas de bancos tradicionales (Bancolombia, Davivienda, BBVA, Banco de Bogotá), no en Nequi.
- El pagador sí paga desde Nequi, Bancolombia, Daviplata, Davivienda, BBVA, Banco de Bogotá, Colpatria, etc.
- Los bancos tradicionales envían correo transaccional confiable cuando la cuenta recibe una transferencia.
- Nequi personal no envía correo transaccional confiable — no es un bloqueo porque el negocio no recibe en Nequi.

## Canal principal: WhatsApp con Baileys

El cliente y el cajero interactúan con CHECK a través de WhatsApp. El negocio imprime un QR estable que se pega en la caja. El cliente escanea, se abre WhatsApp, envía el comprobante, recibe el semáforo. El cajero también puede subir comprobantes desde su tablet/celular usando el mismo WhatsApp o el dashboard web.

- **Librería:** Baileys (Node.js/TypeScript).
- **Humanización anti-baneo:** delays aleatorios (1–4s), indicador "escribiendo…", marcar como leído con delay, presencia online/offline con patrón humano (horario del negocio), rotación de 5–8 plantillas por respuesta, cero mensajes idénticos consecutivos, cero outbound sin trigger, cero broadcasts.
- **Volumen y calentamiento:** todo número nuevo pasa por warmeo de 2 semanas antes de entrar al pool. Escalado de volumen: día 1 máx. 20 msg/hora, semana 2 hasta 60, después hasta 200.
- **Multi-tenant por número:** cada número atiende un grupo acotado de negocios (20–50 pequeños o 5–10 medianos) para aislar radio de daño.
- **Nunca engañar al cliente sobre la naturaleza del sistema.** Si un cliente pregunta si es un bot, responder con la verdad de forma cálida. La humanización es para evitar detección automática de bots por parte de WhatsApp, no para engañar al usuario.

## Contingencia de baneos (uptime real)

- **QR estable con URL corta.** El QR físico contiene `check.co/n/{negocio}`, no un número directo. El servidor resuelve al número activo en el momento del escaneo.
- **Pool de números activos** con health checks cada 60 segundos.
- **Failover automático:** si el número primario cae, el enrutador cambia al secundario transparente para el cliente.
- **Reserva warmeada permanente** para reemplazar caídos el mismo día.
- **Alerta operacional al equipo** cuando un número cae (Slack/Discord/email) con contexto: qué número, cuántos negocios afectaba, cuál es el reemplazo, necesidad de iniciar warmeo de reposición.
- **Persistencia total en Postgres:** conversaciones, comprobantes y sesiones sobreviven a cualquier baneo.
- **Fallback a PWA web:** si todos los números asignados a un negocio están caídos, `check.co/n/{negocio}` abre una PWA web simple donde el cliente sube el comprobante y ve el resultado. Cero downtime para el negocio.

## Flujos soportados

1. **Cliente escanea el QR de la caja** → se abre WhatsApp con el número activo → envía comprobante → recibe semáforo.
2. **Cliente escanea el QR y el pool está caído** → se abre PWA web → sube comprobante → ve semáforo.
3. **Cajero sube el comprobante desde el dashboard web** (para clientes que prefieren mostrar el comprobante en la pantalla).
4. **Cajero recibe notificación en tiempo real** en el dashboard cuando el estado de un comprobante cambia de pendiente a verificado o sospechoso.

Todos los flujos convergen en el mismo motor de verificación.

## Verificación (el corazón del producto)

Un comprobante se cruza contra siete defensas:

1. **Correo transaccional real del banco receptor del negocio.** Match esperado en monto exacto, número de aprobación/referencia, ventana de tiempo configurable (default ±15 min), cuenta destino declarada.
2. **Base global de números de aprobación ya usados.** Si el número aparece por segunda vez en cualquier negocio de la red, es reutilización.
3. **Coincidencia de cuenta destino** declarada por el negocio.
4. **Ventana de tiempo estricta,** configurable por el negocio.
5. **Análisis técnico de la imagen:** Error Level Analysis, metadatos EXIF, doble compresión, resolución/proporción esperada.
6. **Validación estructural del comprobante:** formato y longitud del número de aprobación según el banco emisor.
7. **Patrones sospechosos:** mismo cliente con múltiples intentos fallidos en la red, horarios fuera de operación bancaria del emisor.

## Semáforo del veredicto

- 🟢 **Verificado** — cruce con correo real del banco receptor confirma que la plata llegó. Entrega.
- 🟡 **Esperando confirmación** — validaciones internas ok, correo aún no llega. Suele resolverse en 30 seg – 2 min. No entregar todavía.
- 🚨 **No verificado / Sospechoso** — falla cualquier defensa relevante, o pasa la ventana sin correo real. No entregar.

Regla dura: **sin cruce con correo real del banco receptor, nunca se emite 🟢**. Si un negocio no tiene el reenvío de correo configurado, todos los pagos quedan en 🟡 → 🚨. Esto obliga al negocio a completar el onboarding y hace que un 🟢 valga algo.

## Bancos soportados en el MVP

- **Como receptores del negocio (parsers de correo):** Bancolombia, Davivienda, BBVA.
- **Como emisores del pagador (parsers de comprobante OCR):** Nequi, Bancolombia, Daviplata, Davivienda, BBVA, Banco de Bogotá, Colpatria.

Más bancos se agregan a demanda; el sistema debe estar diseñado para agregar parsers sin refactor.

## Alcance del MVP

- Registro de negocio y multi-tenant con Row Level Security en Postgres.
- Onboarding con guía paso a paso para configurar reenvío automático de correo bancario a `pagos+{negocio_id}@check.co`.
- Ingesta de correos con Postmark Inbound → parsers versionados por banco con tests de regresión.
- OCR de comprobantes (imágenes y PDF) con Google Cloud Vision.
- Extracción estructurada del comprobante (banco emisor, monto, fecha/hora, número de aprobación, cuenta destino, beneficiario).
- Motor de verificación con las 7 defensas y el semáforo.
- Base global de números de aprobación con índice único cruzando todos los negocios.
- Capa WhatsApp Baileys multi-número con humanización, warmeo, pool y failover.
- QR estable por negocio con enrutador `check.co/n/{negocio}` y fallback a PWA.
- Dashboard web del cajero: subir comprobante, ver estado en tiempo real.
- Dashboard web del dueño: histórico, filtros por estado, alertas de intentos sospechosos, configuración de cuentas.
- Roles dueño y cajero.
- Notificación al cajero cuando el estado pasa de 🟡 a 🟢 o 🚨.
- Alertas operacionales del pool WhatsApp al equipo interno.

## Fuera del MVP

- Cobros y suscripciones (el producto es gratuito durante el MVP).
- Integración con pasarelas (Wompi, ePayco, PayU).
- Nequi Conecta.
- App móvil nativa.
- App Android compañera para leer notificaciones.
- Integraciones con software contable o POS.
- Detección de fraude con ML avanzado (más allá de las 7 defensas iniciales).
- Meta WhatsApp Cloud API oficial (queda como ruta futura para clientes empresariales).

## Métricas de éxito

- Tiempo promedio del veredicto 🟢: < 10 segundos.
- Resolución de 🟡 → 🟢: < 2 minutos en el 95% de los casos.
- Detección de comprobantes falsos conocidos: > 95%.
- Falsos positivos (rechazar un pago real): < 0.3%.
- Correos bancarios parseados correctamente por banco: > 98%.
- Uptime del canal WhatsApp (con fallback PWA): > 99.5%.

## Riesgos y mitigaciones

- **Cambios en el formato de los correos del banco:** parsers versionados con tests de regresión y alertas automáticas cuando un correo no matchea patrones esperados.
- **OCR fallido en fotos malas:** el sistema pide una foto mejor en lugar de dar un falso 🚨.
- **Estafador sofisticado que invente un número de aprobación con formato válido:** se detecta cuando aparece el segundo uso (base global) o cuando el correo bancario no llega (cruce). El semáforo es honesto.
- **Baneo de números WhatsApp:** pool, failover, reserva warmeada y fallback PWA garantizan continuidad.
- **Datos sensibles y habeas data:** encriptación en reposo, logs auditables, política de retención, cumplimiento con normativa colombiana.

## Stack técnico

- **Lenguaje:** TypeScript en todo el monorepo.
- **Backend:** NestJS (Node.js 20).
- **Base de datos:** PostgreSQL en Supabase, con Row Level Security multi-tenant.
- **ORM:** Prisma.
- **Auth:** Supabase Auth.
- **OCR:** Google Cloud Vision.
- **Correo entrante:** Postmark Inbound.
- **WhatsApp:** Baileys, multi-instancia orquestada.
- **Cola de trabajos:** BullMQ + Redis (Upstash).
- **Frontend:** Next.js 15 + Tailwind + shadcn/ui.
- **Realtime:** Supabase Realtime.
- **Análisis de imagen:** sharp + exifr.
- **Monorepo:** Turborepo + pnpm.
- **Hosting backend/workers:** Railway.
- **Hosting frontend:** Vercel.

## Estructura del monorepo

```
/apps
  /api           NestJS: API HTTP, webhooks (Postmark, WhatsApp router)
  /workers       NestJS: workers de OCR, verificación, warmeo WhatsApp
  /web           Next.js: dashboard + PWA fallback
/packages
  /database      Prisma schema y cliente compartido
  /shared        tipos, schemas Zod, utilidades
  /parsers       parsers de correos bancarios versionados
  /ocr           integración Google Vision + extracción estructurada
  /verifier      motor de reglas antifraude (las 7 defensas)
  /whatsapp      capa Baileys: instancia, humanización, pool, enrutador
```

## Convenciones del proyecto

- Todos los montos se guardan como enteros en centavos (`Int` en Prisma). Nunca `float`.
- Todas las fechas se guardan en UTC; se muestran en zona `America/Bogota`.
- Cada parser (correo o comprobante) tiene su versión (`v1`, `v2`) y fixtures de test antes de ir a producción.
- Cambios en parsers requieren tests de regresión que cubran fixtures reales anteriores.
- Toda operación con dinero se registra en un log inmutable con `businessId`, `transactionId`, `verdict`, `evidenceSources`.
- Errores nunca se silencian; se envían a la cola de alertas.
