-- ============================================================================
-- CHECK · Épica 12, E12-T7 — cierre de brechas de RLS en tablas tenant añadidas
-- por épicas posteriores a la 2 (que introdujo la RLS original en 1_rls_policies).
--
-- Hallazgo de la revisión de superficie (E12-T7): tres tablas con datos por negocio
-- se crearon sin política RLS:
--   - qr_resolution_logs  (tiene businessId): analítica del enrutador de QR.
--   - wa_voucher_contexts (sin businessId; se aísla vía su voucher).
-- Se les aplica el mismo patrón que a las demás tablas tenant.
--
-- NOTA sobre wa_numbers / wa_sessions: son infraestructura CROSS-TENANT (un mismo
-- número/instancia sirve a varios negocios). No se exponen al cliente Supabase: solo
-- el service_role (workers) las toca. Se dejan SIN política de tenant a propósito
-- (documentado en el prd de E12-T7); habilitar RLS de negocio ahí sería incorrecto.
-- ============================================================================

-- qr_resolution_logs: aislamiento por businessId (mismo patrón tenant).
ALTER TABLE "qr_resolution_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qr_resolution_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "qr_resolution_logs"
    USING ("businessId" = auth_business_id())
    WITH CHECK ("businessId" = auth_business_id());

-- wa_voucher_contexts: no tiene businessId; se aísla vía el negocio de su voucher
-- (mismo enfoque que evidence_sources con su transacción en 1_rls_policies).
ALTER TABLE "wa_voucher_contexts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wa_voucher_contexts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "wa_voucher_contexts"
    USING (EXISTS (
        SELECT 1 FROM "vouchers" v
        WHERE v."id" = "wa_voucher_contexts"."voucherId"
          AND v."businessId" = auth_business_id()
    ));
