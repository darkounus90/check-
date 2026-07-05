# E05-T1 Integracion Google Cloud Vision

## Goal

Reemplazar el stub de `GoogleVisionProvider` (`packages/ocr/src/providers/google-vision.ts`) por una integración real con Google Cloud Vision (`documentTextDetection`), sin acoplar el build del MVP a la credencial (import dinámico del SDK).

## Requirements

- Instalar `@google-cloud/vision` en `packages/ocr` (no está en `package.json` hoy).
- Implementar `GoogleVisionProvider.recognize(input: Uint8Array): Promise<Result<string>>` usando `documentTextDetection` vía import dinámico (`await import("@google-cloud/vision")`), para que el paquete siga funcionando (build/tests) sin credencial configurada.
- El cliente de Vision se autentica por convención estándar del SDK (`GOOGLE_APPLICATION_CREDENTIALS` apuntando al JSON de service account) — no hardcodear credenciales ni rutas.
- Diseñar la clase para ser testeable sin red real: inyectar/permitir sustituir el cliente interno del SDK (constructor param opcional o similar) para que los tests unitarios puedan usar un cliente fake.
- Manejo de errores: si Vision devuelve sin texto, o la llamada falla (credencial ausente, red, cuota), devolver `err(...)` con mensaje claro — nunca lanzar excepción sin capturar.
- No se dispone de credencial real todavía (deuda pendiente para el dueño del producto) — la integración debe quedar completa y correcta, verificable con un cliente fake en tests; la verificación end-to-end con Vision real queda como deuda a resolver cuando exista la credencial.

## Acceptance Criteria

- [x] Con un cliente fake inyectado que simula `documentTextDetection`, `recognize()` devuelve el texto extraído (`ok(texto)`).
- [x] Si el cliente fake simula un error/timeout, `recognize()` devuelve `err(...)` sin lanzar excepción.
- [x] Si `@google-cloud/vision` no puede resolverse o falla el import dinámico, `recognize()` devuelve `err(...)` con mensaje explicativo (no rompe el build de otros paquetes que dependen de `@check/ocr`).
- [x] `pnpm --filter @check/ocr test` pasa, incluyendo los tests nuevos de `GoogleVisionProvider`.
- [x] `pnpm --filter @check/ocr build` y `typecheck` pasan.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
