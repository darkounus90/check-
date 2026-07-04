# E01-T6 · Esqueleto packages/parsers

## Goal
Contrato `BankEmailParser` versionado + registro vacío; compila.

## Acceptance Criteria
- [x] `@check/parsers` compila y emite tipos.
- [x] Exporta `BankEmailParser` (con `bank`, `version`, `matches`, `parse`), `ParsedBankEmail`, y `bankEmailParserRegistry` (vacío).
- [x] Usa tipos de `@check/shared` (`Cents`, `Result`) — linkage verificado.
- [x] `"type": "module"` declarado (D8).

## Notes
- Implementado en `packages/parsers/`. Los parsers reales por banco receptor y sus fixtures llegan en la Épica 4; se agregan al registro sin refactor del core.
