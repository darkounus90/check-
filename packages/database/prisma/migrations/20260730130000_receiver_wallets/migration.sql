-- ============================================================================
-- CHECK · Entidades receptoras: agrega billeteras Nequi y Daviplata al enum
-- ReceiverBank. Su "cuenta" es una llave Bre-B (número de celular), que se guarda
-- en la misma columna receiving_accounts.accountNumber (texto libre).
-- ============================================================================

ALTER TYPE "ReceiverBank" ADD VALUE IF NOT EXISTS 'NEQUI';
ALTER TYPE "ReceiverBank" ADD VALUE IF NOT EXISTS 'DAVIPLATA';
