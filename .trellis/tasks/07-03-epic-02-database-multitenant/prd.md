# Épica 2 — Base de datos y multi-tenant

**Objetivo:** modelar el dominio en Prisma, generar migraciones y activar Row Level Security (RLS) multi-tenant en Supabase/Postgres. Todos los datos quedan aislados por `businessId`.

**Dependencias:** Épica 1 (existe `packages/database`).

**Criterio de aceptación de la épica:** las migraciones aplican en una BD Supabase limpia; RLS impide que un tenant lea/escriba filas de otro (probado con dos negocios); la base global de números de aprobación tiene índice único cruzando negocios.

## Mapa de subtareas

Leyenda: `[∥]` paralelizable · `[→]` secuencial.

### Grupo A — fundación Prisma (secuencial)

- **E02-T1 [→]** Configurar Prisma contra Supabase Postgres (datasource, generator, conexión pooler). **Aceptación:** `prisma db pull`/`migrate dev` conecta; cliente se genera.
- **E02-T2 [→]** Convención de esquema: `Int` centavos para dinero, timestamps UTC, `businessId` en toda tabla tenant. **Aceptación:** documentado en el schema y aplicado en los modelos siguientes.

### Grupo B — modelos de dominio (paralelizable tras Grupo A; cada uno es un modelo/grupo aislado)

- **E02-T3 [∥]** Modelos de identidad/tenant: `Business`, `User`, `Role` (dueño/cajero), `Membership`. **Aceptación:** migración aplica; relaciones y unicidades correctas.
- **E02-T4 [∥]** Modelos de cuentas receptoras: `ReceivingAccount` (banco, número, alias) + buzón entrante ligado a un **ID opaco** de negocio (ver D3). Dominio/formato de buzón es **configuración**, no literal (D1–D2). **Aceptación:** migración aplica; un negocio puede tener varias cuentas; el negocio tiene un `opaqueId` no adivinable y un identificador de buzón entrante.
- **E02-T5 [∥]** Modelos transaccionales: `Voucher` (comprobante), `Transaction`, `Verdict` (verificado/pendiente/sospechoso), `EvidenceSource`. **Aceptación:** migración aplica; enums de estado definidos.
- **E02-T6 [∥]** Modelo de correo bancario: `BankEmail` (raw, parsed, banco, versión de parser). **Aceptación:** migración aplica.
- **E02-T7 [∥]** Base global de aprobaciones: `ApprovalNumber` con **índice único global** por `(bank, approvalNumber)` cruzando todos los negocios. **Aceptación:** insertar el mismo número dos veces falla por constraint.
- **E02-T8 [∥]** Modelo WhatsApp: `WaNumber`, `WaSession`, `NumberPoolAssignment` (número↔negocios). **Aceptación:** migración aplica.
- **E02-T9 [∥]** Log inmutable de operaciones con dinero: `MoneyOpLog` (`businessId`, `transactionId`, `verdict`, `evidenceSources`, append-only). **Aceptación:** existe; no expone update/delete en la capa de acceso.

### Grupo C — RLS y cierre (secuencial, tras Grupo B)

- **E02-T10 [→]** Políticas RLS por tenant en todas las tablas con `businessId`. **Aceptación:** con el claim de un negocio, un `select`/`insert` sobre filas de otro negocio devuelve 0 filas / falla.
- **E02-T11 [→]** Excepción RLS controlada para la base global de aprobaciones: función de BD de alcance restringido que responde **solo "existe / no existe"** cross-tenant, sin revelar el negocio dueño (ver D6). **Aceptación:** el verificador detecta reutilización recibiendo únicamente un booleano de existencia; ningún dato de otro negocio es accesible.
- **E02-T12 [→]** Seed de desarrollo (2 negocios, roles, cuentas, datos de prueba). **Aceptación:** `prisma db seed` deja un entorno usable para probar RLS.
- **E02-T13 [→]** Tests de aislamiento multi-tenant. **Aceptación:** suite que prueba fuga cero entre dos tenants corre en verde.
