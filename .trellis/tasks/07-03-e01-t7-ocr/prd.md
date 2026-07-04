# E01-T7 · Esqueleto packages/ocr

## Goal
Contrato `OcrProvider` + `VoucherExtractor` placeholder; compila.

## Acceptance Criteria
- [x] `@check/ocr` compila y emite tipos.
- [x] Exporta `OcrProvider` (`recognize`), `VoucherExtractor`, `ExtractedVoucher`, y `voucherExtractorRegistry` (vacío).
- [x] Usa tipos de `@check/shared` — linkage verificado.
- [x] `"type": "module"` declarado (D8).

## Notes
- Implementado en `packages/ocr/`. La integración con Google Cloud Vision y los extractores por banco emisor llegan en la Épica 5.
