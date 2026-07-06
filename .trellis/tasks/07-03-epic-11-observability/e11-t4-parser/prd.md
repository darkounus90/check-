# E11-T4 — Alerta de parser que deja de matchear

Se dispara cuando una tanda de correos bancarios (api) o comprobantes OCR (workers) cae
mayormente en "no reconocido". Tasa de fallo por banco en el contexto. Umbral por ventana.

## Entregable
- `packages/shared/src/alert-triggers.ts`: `evaluateParserFailure` (puro).
- `packages/shared/src/parser-failure-tracker.ts`: `ParserFailureTracker` (ventana móvil,
  reutilizado por correos y comprobantes).
- api: `IngestionService.recordParseOutcome` (correos bancarios).
- workers: `OcrObserver.onExtractionResult` (comprobantes OCR).

## Criterios de aceptación
- [x] Una tanda de correos no parseados dispara alerta indicando banco/desglose.
- [x] Una tanda de comprobantes no reconocidos (OCR) dispara alerta (`voucher_ocr`).
- [x] No dispara con muestra pequeña ni con tasa de fallo bajo umbral; resetea por ventana.
