# Épica 5 — OCR y extracción estructurada del comprobante

**Objetivo:** recibir la imagen/PDF del comprobante, pasarla por Google Cloud Vision, y extraer campos estructurados (banco emisor, monto, fecha/hora, número de aprobación, cuenta destino, beneficiario) con parsers por banco emisor (Nequi, Bancolombia, Daviplata, Davivienda, BBVA, Banco de Bogotá, Colpatria).

**Dependencias:** Épica 1 (`packages/ocr`), Épica 2 (`Voucher`).

**Criterio de aceptación de la épica:** para un comprobante de cada banco emisor soportado, el sistema detecta el banco y extrae los campos con los tipos correctos (monto en centavos, fecha UTC); una foto ilegible produce "pide mejor foto", no un falso 🚨; los fixtures de regresión pasan.

## Mapa de subtareas

### Grupo A — pipeline OCR (secuencial)

- **E05-T1 [→]** Integración con Google Cloud Vision (credenciales, cliente en `packages/ocr`). **Aceptación:** una imagen de prueba devuelve texto/bloques.
- **E05-T2 [→]** Normalización de entrada: imágenes y PDF, `sharp` para pre-proceso (orientación, tamaño). **Aceptación:** JPG/PNG/PDF entran al mismo pipeline y salen normalizados.
- **E05-T3 [→]** Worker de OCR en `apps/workers` (job desde cola) + persistencia de texto crudo en `Voucher`. **Aceptación:** subir un comprobante encola y produce OCR persistido.

### Grupo B — detección y parsers por banco emisor (paralelizable; mismo contrato)

- **E05-T4 [∥]** Detector de banco emisor a partir del OCR. **Aceptación:** clasifica correctamente los 7 emisores en fixtures; ambiguo → marca "desconocido".
- **E05-T5 [∥]** Parser comprobante `nequi@v1`. **Aceptación:** extrae campos estructurados; fixtures pasan.
- **E05-T6 [∥]** Parser comprobante `bancolombia@v1`. **Aceptación:** ídem.
- **E05-T7 [∥]** Parser comprobante `daviplata@v1`. **Aceptación:** ídem.
- **E05-T8 [∥]** Parser comprobante `davivienda@v1`. **Aceptación:** ídem.
- **E05-T9 [∥]** Parser comprobante `bbva@v1`. **Aceptación:** ídem.
- **E05-T10 [∥]** Parser comprobante `banco-de-bogota@v1`. **Aceptación:** ídem.
- **E05-T11 [∥]** Parser comprobante `colpatria@v1`. **Aceptación:** ídem.

### Grupo C — calidad y cierre (secuencial, tras Grupo B)

- **E05-T12 [→]** Registro/dispatcher de parsers de comprobante versionados (agregar banco sin refactor). **Aceptación:** nuevo emisor = registrar parser.
- **E05-T13 [→]** Detección de foto de baja calidad → respuesta "pide mejor foto". **Aceptación:** una imagen borrosa/parcial no produce 🚨; solicita reintento.
- **E05-T14 [→]** Fixtures reales de comprobantes + harness de regresión por banco emisor. **Aceptación:** suite de regresión corre y bloquea merge ante ruptura.
