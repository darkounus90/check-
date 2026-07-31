-- ============================================================================
-- CHECK · Onboarding del buzón — conexión de correo más fácil (Opción B) + modo
-- "sin correo" explícito (nivel intermedio para bancos/billeteras que no envían
-- correo de abono, ej. algunos flujos Bre-B).
--
-- Campos nuevos en businesses:
--   - noBankEmail:   el dueño declaró que su banco no manda correos → modo solo
--                    comprobante (🟡 provisional, nunca 🟢 por correo).
--   - fwdConfirmCode/Link/ConfirmedAt: auto-confirmación del reenvío de Gmail. El
--     correo "Gmail Forwarding Confirmation" llega a NUESTRO buzón; la ingesta
--     guarda código+enlace y lo confirma automáticamente.
--
-- Todos con default / NULL → migración segura sobre filas existentes.
-- ============================================================================

ALTER TABLE "businesses" ADD COLUMN "noBankEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "businesses" ADD COLUMN "fwdConfirmCode" TEXT;
ALTER TABLE "businesses" ADD COLUMN "fwdConfirmLink" TEXT;
ALTER TABLE "businesses" ADD COLUMN "fwdConfirmedAt" TIMESTAMP(3);
