# Épica 12 — Hardening de seguridad y cumplimiento

**Objetivo:** encriptación en reposo de datos sensibles, políticas de retención de datos, y cumplimiento con habeas data / normativa colombiana (auditoría, derechos del titular). Endurecer el sistema antes de operar con datos reales.

**Dependencias:** todas las anteriores (se endurece lo ya construido); apoyada por el logging/auditoría de la Épica 11.

**Criterio de aceptación de la épica:** los datos sensibles (comprobantes, sesiones WhatsApp, PII) están encriptados en reposo; existe política de retención aplicada por job; un titular puede ejercer sus derechos (acceso/eliminación); hay registro de auditoría inmutable de accesos a datos sensibles.

## Mapa de subtareas

### Grupo A — encriptación y secretos (paralelizable)

- **E12-T1 [∥]** Encriptación en reposo de campos/artefactos sensibles (comprobantes, auth-state WhatsApp, PII). **Aceptación:** los datos sensibles quedan cifrados en storage; sin la clave no son legibles.
- **E12-T2 [∥]** Gestión de secretos y rotación (claves de cifrado, credenciales Vision/Postmark/Supabase). **Aceptación:** ningún secreto en el repo; rotación documentada y probada.

### Grupo B — retención y derechos del titular (paralelizable)

- **E12-T3 [∥]** Política de retención + job de purga por tipo de dato y antigüedad. **Aceptación:** datos fuera de ventana de retención se purgan automáticamente y queda traza.
- **E12-T4 [∥]** Habeas data: flujo de acceso/rectificación/eliminación a solicitud del titular. **Aceptación:** dado un titular, se puede exportar y eliminar su información cumpliendo normativa colombiana.
- **E12-T5 [∥]** Consentimiento y aviso de privacidad en los puntos de entrada (WhatsApp/PWA/dashboard). **Aceptación:** el usuario ve/acepta el aviso donde corresponde y queda registrado.

### Grupo C — auditoría y verificación (secuencial, tras A y B)

- **E12-T6 [→]** Registro de auditoría inmutable de accesos a datos sensibles (quién, qué, cuándo). **Aceptación:** todo acceso a PII/comprobante queda auditado y es consultable.
- **E12-T7 [→]** Revisión de superficie: RLS, endpoints públicos (PWA), rate limits, headers de seguridad. **Aceptación:** checklist de seguridad revisado; sin endpoints tenant sin RLS ni públicos sin límite.
- **E12-T8 [→]** Prueba de cumplimiento end-to-end (encriptación + retención + habeas data + auditoría). **Aceptación:** un recorrido completo demuestra los cuatro pilares funcionando juntos.
