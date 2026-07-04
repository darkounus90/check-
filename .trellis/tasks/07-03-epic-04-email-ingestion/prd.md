# Épica 4 — Ingesta de correos bancarios

**Objetivo:** recibir correos transaccionales vía Postmark Inbound, enrutar cada correo al negocio por su **buzón entrante dedicado** (identificado por el ID opaco / hash de Postmark — D1–D3), y parsear el contenido con parsers versionados por banco receptor (Bancolombia, Davivienda, BBVA), con tests de regresión sobre fixtures reales.

**Dependencias:** Épica 1 (`packages/parsers`), Épica 2 (`BankEmail`, cuentas), Épica 3 (buzón verificado).

**Criterio de aceptación de la épica:** un correo inbound real de cada banco receptor se parsea correctamente (monto en centavos, número de aprobación, fecha UTC, cuenta destino) y se persiste ligado al negocio; los tests de regresión con fixtures reales pasan; un correo no reconocido dispara alerta y no rompe el flujo.

## Mapa de subtareas

### Grupo A — pipeline de recepción (secuencial)

- **E04-T1 [→]** Webhook Postmark Inbound en `apps/api` con verificación de firma. **Aceptación:** un POST de Postmark autenticado se acepta; uno no firmado se rechaza.
- **E04-T2 [→]** Enrutamiento por buzón: resolver el negocio desde el identificador de buzón entrante (ID opaco / hash de Postmark) y ligar el correo. El mapeo buzón→negocio y el dominio son **configuración** (D1–D3). **Aceptación:** el correo queda asociado al negocio correcto; buzón desconocido → alerta.
- **E04-T3 [→]** Persistir correo crudo en `BankEmail` y encolar job de parseo (BullMQ). **Aceptación:** el correo crudo se guarda antes de parsear; el job se encola.

### Grupo B — parsers por banco receptor (paralelizable; uno por banco, mismo contrato)

- **E04-T4 [∥]** Parser `bancolombia@v1` (correo receptor). **Aceptación:** extrae monto (centavos), aprobación, fecha UTC, cuenta destino; fixtures reales pasan.
- **E04-T5 [∥]** Parser `davivienda@v1` (correo receptor). **Aceptación:** ídem sobre fixtures Davivienda.
- **E04-T6 [∥]** Parser `bbva@v1` (correo receptor). **Aceptación:** ídem sobre fixtures BBVA.

### Grupo C — infraestructura de parsers y cierre (secuencial, tras Grupo B)

- **E04-T7 [→]** Registro/dispatcher de parsers versionados (selección por banco + versión, sin refactor para agregar banco). **Aceptación:** agregar un parser nuevo es registrar, no modificar el core.
- **E04-T8 [→]** Set de fixtures de correos reales + harness de regresión. **Aceptación:** `pnpm --filter parsers test` corre todos los fixtures y bloquea merge si uno rompe.
- **E04-T9 [→]** Manejo de correo no reconocido: guardar, marcar `unparsed`, disparar alerta (feed de Épica 11). **Aceptación:** un formato nuevo no se pierde ni crashea; queda visible para operación.
- **E04-T10 [→]** Persistir resultado parseado y exponerlo al motor de verificación. **Aceptación:** el correo parseado queda consultable por `(negocio, monto, aprobación, ventana)`.
