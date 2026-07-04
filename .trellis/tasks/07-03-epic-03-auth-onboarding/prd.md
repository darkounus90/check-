# Épica 3 — Auth y onboarding de negocios

**Objetivo:** autenticación con Supabase Auth, roles dueño/cajero, y flujo de onboarding que deja al negocio con cuentas receptoras declaradas y el reenvío de correo a su **buzón entrante dedicado** configurado y verificado. El buzón usa el **ID opaco** del negocio (D3); dominio/formato son **configuración** — MVP arranca con el buzón gratuito de Postmark Inbound (D1–D2).

**Dependencias:** Épica 2 (modelos de tenant, roles y cuentas).

**Criterio de aceptación de la épica:** un dueño se registra, crea el negocio, invita a un cajero, declara al menos una cuenta receptora, configura el buzón y el sistema confirma la recepción de un correo de prueba en ese buzón.

## Mapa de subtareas

### Grupo A — auth base (secuencial)

- **E03-T1 [→]** Integrar Supabase Auth en `apps/api` (verificación de JWT) y sesión en `apps/web`. **Aceptación:** login/logout funciona; endpoints protegidos rechazan sin token.
- **E03-T2 [→]** Mapear usuario Supabase ↔ `User`/`Membership`/`Business` con claim de `businessId` para RLS. **Aceptación:** el token lleva `businessId` y las consultas respetan RLS.

### Grupo B — roles y registro (paralelizable tras Grupo A)

- **E03-T3 [∥]** Guard/decorador de roles dueño vs cajero en la API. **Aceptación:** un cajero recibe 403 en acciones de dueño (p. ej. borrar cuenta).
- **E03-T4 [∥]** Registro de negocio (crear `Business` + primer dueño). **Aceptación:** al registrarse queda un negocio con dueño, un `opaqueId` no adivinable y su buzón entrante (Postmark) asignado.
- **E03-T5 [∥]** Invitación/alta de cajero. **Aceptación:** el dueño invita por email; el cajero acepta y queda con rol cajero en ese negocio.

### Grupo C — onboarding de cuentas y buzón (secuencial, tras Grupo B)

- **E03-T6 [→]** CRUD de cuentas receptoras (banco receptor, número, alias). **Aceptación:** el dueño agrega/edita/borra cuentas; validación de banco soportado.
- **E03-T7 [→]** Guía paso a paso de configuración de reenvío de correo bancario al buzón dedicado. **Aceptación:** UI muestra instrucciones por banco receptor y el estado "pendiente/verificado".
- **E03-T8 [→]** Verificación de buzón: detectar el primer correo entrante y marcar onboarding como completo. **Aceptación:** al llegar un correo de prueba al buzón, el estado cambia a "verificado".
- **E03-T9 [→]** Gate de producto: sin buzón verificado, el negocio no puede emitir 🟢 (todo queda 🟡→🚨). **Aceptación:** un negocio sin correo configurado nunca produce un veredicto verde.
