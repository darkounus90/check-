# Épica 6 — Motor de verificación antifraude

**Objetivo:** orquestar las 7 defensas y emitir el semáforo (verificado/pendiente/sospechoso), con la regla dura: **sin cruce con correo real del banco receptor, nunca 🟢**. Escribir cada operación al log inmutable de dinero.

**Dependencias:** Épica 2 (modelos + base global), Épica 4 (correo parseado), Épica 5 (comprobante extraído).

**Criterio de aceptación de la épica:** dado un comprobante + estado de correos, el motor emite el veredicto correcto según las reglas; un comprobante sin correo real nunca da 🟢; una reutilización de número de aprobación da 🚨; cada veredicto queda en `MoneyOpLog` con sus `evidenceSources`.

## Mapa de subtareas

### Grupo A — contrato y orquestación (secuencial)

- **E06-T1 [→]** Definir contrato `Defense` (input comprobante+contexto → señal ponderada) y el agregador que produce `Verdict`. **Aceptación:** el motor corre con defensas mock y produce un veredicto determinista.
- **E06-T2 [→]** Máquina de estados del semáforo 🟡→🟢/🚨 con ventana de tiempo y reintento de espera de correo. **Aceptación:** un 🟡 se resuelve a 🟢 al llegar el correo dentro de ventana, o a 🚨 si expira.

### Grupo B — las 7 defensas (paralelizable; cada defensa implementa el contrato)

- **E06-T3 [∥]** Defensa 1: cruce con correo real del banco receptor (monto exacto, aprobación, ventana ±15 min configurable, cuenta destino). **Aceptación:** match/no-match correcto sobre casos de prueba; **única defensa que habilita 🟢**.
- **E06-T4 [∥]** Defensa 2: base global de números de aprobación (segundo uso = reutilización) vía consulta **solo-existencia** cross-tenant (D6). **Aceptación:** un número ya visto en cualquier negocio marca 🚨, sin exponer de qué negocio provino.
- **E06-T5 [∥]** Defensa 3: coincidencia de cuenta destino con **match flexible** — últimos 4 dígitos y/o nombre del beneficiario vs. lo declarado (D4). Coincidencia suma confianza; ilegible **no penaliza**; umbral configurable. **Aceptación:** un destino distinto al declarado baja el veredicto; un comprobante con destino no legible no cae a 🚨 solo por esta defensa.
- **E06-T6 [∥]** Defensa 4: ventana de tiempo estricta configurable por negocio. **Aceptación:** fuera de ventana no permite 🟢.
- **E06-T7 [∥]** Defensa 5: análisis técnico de imagen (ELA, EXIF, doble compresión, resolución/proporción) usando `sharp`+`exifr`. **Aceptación:** un comprobante editado conocido dispara señal de manipulación.
- **E06-T8 [∥]** Defensa 6: validación estructural (formato/longitud del número de aprobación según banco emisor). **Aceptación:** número con formato inválido para el banco marca sospecha.
- **E06-T9 [∥]** Defensa 7: patrones sospechosos. En MVP se prioriza **múltiples intentos fallidos del mismo cliente en la red**; los **horarios por banco quedan apagados/configurables** (D5, mejora post-MVP). **Aceptación:** un cliente con N intentos fallidos configurados en la red dispara señal; los horarios no producen falsos 🚨 en MVP.

### Grupo C — integración y cierre (secuencial, tras Grupo B)

- **E06-T10 [→]** Cablear las 7 defensas reales al agregador + regla dura "sin correo real, nunca 🟢". **Aceptación:** ningún camino produce 🟢 sin defensa 1 en positivo.
- **E06-T11 [→]** Escritura al `MoneyOpLog` inmutable con `businessId`, `transactionId`, `verdict`, `evidenceSources`. **Aceptación:** cada veredicto deja exactamente una entrada auditable.
- **E06-T12 [→]** Worker de verificación en `apps/workers` (consume cola, reintenta espera de correo). **Aceptación:** flujo end-to-end desde comprobante hasta veredicto persistido.
- **E06-T13 [→]** Suite de escenarios de fraude (falso, reutilizado, monto alterado, cuenta alterada, fuera de ventana). **Aceptación:** cada escenario produce el veredicto esperado.
