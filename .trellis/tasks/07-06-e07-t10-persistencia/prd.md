# E07-T10 — Persistencia total sobrevive-baneo

**Épica 7, Grupo C.** Garantiza que conversación (`WaVoucherContext`), comprobante (`Voucher`)
y sesión (`WaSession`) sobreviven a un baneo/reinicio.

## Requisitos

- Tras un baneo simulado (la instancia cae), no se pierde ninguna conversación ni comprobante.
- Al reemplazar el número, el histórico persiste.
- Test que simule caída y verifique que nada en BD se pierde y que un número nuevo puede
  retomar.

## Aceptación

Tras un baneo simulado: `Voucher`, `WaVoucherContext` y `WaSession` intactos; un número nuevo
levanta sin perder el histórico.

## Diseño

Clave: la `WhatsAppInstance` es stateless respecto de los datos de negocio — todo (voucher,
contexto, auth-state) se persiste en el store (Postgres) en el momento de la ingesta (E07-T2)
y en cada `creds.update`/`keys.set` (E07-T1). "Matar" la instancia no borra nada; el pool
(E07-T7) permite `remove` + `add` para el reemplazo en caliente.

- Test: `packages/whatsapp/test/persistence.test.ts` modela la BD con un store en memoria que
  sobrevive a la caída de la instancia; verifica que baneo → BD intacta, y remove+add de un
  número nuevo conserva el histórico.
