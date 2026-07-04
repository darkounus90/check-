# Épica 10 — Dashboard web del cajero y del dueño

**Objetivo:** dashboard en Next.js (Tailwind + shadcn/ui) con Supabase Realtime. El cajero sube comprobantes y ve el estado en vivo; el dueño ve histórico, filtros, alertas de intentos sospechosos y configura cuentas. Respeta roles y RLS.

**Dependencias:** Épica 3 (auth/roles), Épica 6 (veredictos), Épica 2 (datos + RLS).

**Criterio de aceptación de la épica:** un cajero autenticado sube un comprobante y ve el semáforo cambiar en tiempo real; un dueño ve el histórico filtrable y las alertas de su negocio; un cajero no accede a vistas de dueño; todo respeta RLS.

## Mapa de subtareas

### Grupo A — shell autenticado (secuencial)

- **E10-T1 [→]** Layout autenticado, navegación por rol, sesión Supabase en `apps/web`. **Aceptación:** tras login se ve el dashboard correspondiente al rol; sin sesión redirige a login.
- **E10-T2 [→]** Capa de datos con RLS + suscripción base de Supabase Realtime. **Aceptación:** las consultas sólo devuelven datos del negocio del usuario; el canal Realtime conecta.

### Grupo B — vistas del cajero (paralelizable tras Grupo A)

- **E10-T3 [∥]** Subir comprobante desde el dashboard (flujo 3 del PRD). **Aceptación:** el cajero sube archivo y se crea el `Voucher` ligado al negocio.
- **E10-T4 [∥]** Vista de estado en vivo del comprobante (🟡→🟢/🚨) vía Realtime. **Aceptación:** el semáforo se actualiza sin recargar al cambiar el veredicto.
- **E10-T5 [∥]** Notificación al cajero cuando el estado pasa de 🟡 a 🟢 o 🚨 (flujo 4). **Aceptación:** el cajero recibe aviso in-app al resolverse un veredicto.

### Grupo C — vistas del dueño (paralelizable tras Grupo A)

- **E10-T6 [∥]** Histórico de transacciones con filtros por estado/fecha/cuenta. **Aceptación:** el dueño lista y filtra veredictos de su negocio.
- **E10-T7 [∥]** Panel de intentos sospechosos/alertas de fraude. **Aceptación:** los 🚨 y patrones sospechosos aparecen destacados.
- **E10-T8 [∥]** Configuración de cuentas receptoras y estado de onboarding del buzón (UI sobre Épica 3). **Aceptación:** el dueño gestiona cuentas y ve estado del reenvío de correo.

### Grupo D — cierre (secuencial)

- **E10-T9 [→]** Estados de carga/vacío/error y responsive móvil. **Aceptación:** todas las vistas manejan carga/vacío/error y funcionan en móvil.
