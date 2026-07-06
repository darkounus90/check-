-- ============================================================================
-- CHECK · Épica 12 — Hardening y cumplimiento
--   E12-T6: auditoría inmutable (append-only)
--   E12-T5: registro de consentimiento
--   E12-T7: custom-access-token hook de Supabase (inyecta business_id/user_role
--           en el JWT para que la RLS directa funcione — gap conocido)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- E12-T6: data_access_audits — auditoría inmutable de accesos a datos sensibles
-- ---------------------------------------------------------------------------
CREATE TABLE "data_access_audits" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_access_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_access_audits_businessId_occurredAt_idx"
    ON "data_access_audits"("businessId", "occurredAt");
CREATE INDEX "data_access_audits_resource_resourceId_idx"
    ON "data_access_audits"("resource", "resourceId");

ALTER TABLE "data_access_audits"
    ADD CONSTRAINT "data_access_audits_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- E12-T5: privacy_consents — registro de consentimiento / aviso de privacidad
-- ---------------------------------------------------------------------------
CREATE TABLE "privacy_consents" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "channel" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "metadata" JSONB,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_consents_businessId_channel_idx"
    ON "privacy_consents"("businessId", "channel");
CREATE INDEX "privacy_consents_channel_subjectRef_idx"
    ON "privacy_consents"("channel", "subjectRef");

ALTER TABLE "privacy_consents"
    ADD CONSTRAINT "privacy_consents_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- E12-T6: INMUTABILIDAD real de la auditoría — trigger que bloquea UPDATE/DELETE
-- para CUALQUIER rol (incluido service_role, que normalmente omite RLS). Combinado
-- con las políticas RLS de abajo, la tabla es estrictamente append-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_mutation_append_only()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es append-only: no se permite % ', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER data_access_audits_no_update
    BEFORE UPDATE ON "data_access_audits"
    FOR EACH ROW EXECUTE FUNCTION block_mutation_append_only();

CREATE TRIGGER data_access_audits_no_delete
    BEFORE DELETE ON "data_access_audits"
    FOR EACH ROW EXECUTE FUNCTION block_mutation_append_only();

-- RLS: el negocio ve su propia auditoría (solo lectura); no update/delete.
ALTER TABLE "data_access_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_access_audits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "data_access_audits"
    FOR SELECT USING ("businessId" = auth_business_id());
CREATE POLICY tenant_insert ON "data_access_audits"
    FOR INSERT WITH CHECK ("businessId" = auth_business_id());
CREATE POLICY no_update ON "data_access_audits" FOR UPDATE USING (false);
CREATE POLICY no_delete ON "data_access_audits" FOR DELETE USING (false);

-- RLS de privacy_consents: aislamiento por negocio (mismo patrón tenant).
ALTER TABLE "privacy_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "privacy_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "privacy_consents"
    USING ("businessId" = auth_business_id())
    WITH CHECK ("businessId" = auth_business_id());

-- ---------------------------------------------------------------------------
-- E12-T7: custom-access-token hook de Supabase.
--
-- GAP conocido: el hook que inyecta `business_id`/`user_role` como claims del JWT
-- nunca se cableó, por lo que la RLS directa desde el cliente Supabase estaba
-- INERTE (todo el acceso tenant va mediado por la API con TenantService fijando el
-- claim server-side). Aquí dejamos LISTA la función SQL del hook. Para activarla en
-- el proyecto Supabase real hay que registrarla en el dashboard:
--   Authentication → Hooks → Custom Access Token → public.custom_access_token_hook
-- (esa activación es configuración del proyecto, no aplicable por migración en este
-- entorno; ver checklist en el prd de E12-T7).
--
-- La función recibe el `event` del hook (jsonb con `user_id` y `claims`) y devuelve
-- el event con los claims `business_id`/`user_role` añadidos, resueltos desde la
-- membresía del usuario. Si el usuario no tiene membresía, devuelve el event intacto.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_supabase_user_id text;
    v_business_id text;
    v_role text;
    v_claims jsonb;
BEGIN
    v_supabase_user_id := event ->> 'user_id';
    v_claims := coalesce(event -> 'claims', '{}'::jsonb);

    SELECT m."businessId", m."role"
      INTO v_business_id, v_role
      FROM "memberships" m
      JOIN "users" u ON u."id" = m."userId"
     WHERE u."supabaseUserId" = v_supabase_user_id
     ORDER BY m."createdAt" ASC
     LIMIT 1;

    IF v_business_id IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{business_id}', to_jsonb(v_business_id));
        v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
        event := jsonb_set(event, '{claims}', v_claims);
    END IF;

    RETURN event;
END;
$$;

-- Permisos que Supabase Auth (rol supabase_auth_admin) necesita para ejecutar el hook.
-- Se envuelven en un bloque tolerante: en entornos sin ese rol (dev local sin la
-- extensión de Auth) simplemente se omiten sin romper la migración.
DO $$
BEGIN
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
    GRANT SELECT ON "memberships", "users" TO supabase_auth_admin;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'rol supabase_auth_admin no existe en este entorno; grants del hook omitidos';
END $$;
