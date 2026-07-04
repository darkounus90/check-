-- ============================================================================
-- CHECK · Row Level Security multi-tenant (E02-T10) + base global (E02-T11, D6)
-- ============================================================================
-- Se aplica DESPUÉS de `prisma migrate deploy` (que crea las tablas).
-- Patrón Supabase: el JWT lleva el claim `business_id`; las políticas lo leen de
-- current_setting('request.jwt.claims'). El rol de servicio (service_role) omite RLS.
--
-- Helper: business_id del JWT actual (NULL si no hay).
create or replace function auth_business_id() returns text
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'business_id', '')
$$;

-- ---------------------------------------------------------------------------
-- Tablas tenant: RLS ON + aislamiento por businessId
-- ---------------------------------------------------------------------------

-- businesses: la fila propia (id = business_id del JWT)
alter table "businesses" enable row level security;
alter table "businesses" force row level security;
create policy tenant_isolation on "businesses"
  using ("id" = auth_business_id())
  with check ("id" = auth_business_id());

-- Tablas con columna businessId
do $$
declare t text;
begin
  foreach t in array array[
    'memberships','receiving_accounts','vouchers','transactions',
    'bank_emails','number_pool_assignments','money_op_logs'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format(
      'create policy tenant_isolation on %I using ("businessId" = auth_business_id()) with check ("businessId" = auth_business_id());',
      t
    );
  end loop;
end $$;

-- evidence_sources no tiene businessId: se aísla vía su transacción.
alter table "evidence_sources" enable row level security;
alter table "evidence_sources" force row level security;
create policy tenant_isolation on "evidence_sources"
  using (exists (
    select 1 from "transactions" tx
    where tx."id" = "evidence_sources"."transactionId"
      and tx."businessId" = auth_business_id()
  ));

-- ---------------------------------------------------------------------------
-- money_op_logs: append-only (sin update ni delete para tenants)
-- ---------------------------------------------------------------------------
create policy no_update on "money_op_logs" for update using (false);
create policy no_delete on "money_op_logs" for delete using (false);

-- ---------------------------------------------------------------------------
-- Base global de aprobaciones (E02-T11, D6): SOLO existencia, nunca de qué negocio
-- ---------------------------------------------------------------------------
-- RLS ON sin política de select para tenants => un select directo no devuelve filas.
alter table "approval_numbers" enable row level security;
alter table "approval_numbers" force row level security;

-- Función SECURITY DEFINER: responde existe/no-existe cruzando toda la red,
-- sin exponer firstBusinessId ni ninguna otra columna.
create or replace function approval_number_exists(p_bank text, p_approval text)
  returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from "approval_numbers"
    where "bank" = p_bank and "approvalNumber" = p_approval
  )
$$;

-- Registrar un número (idempotente por el índice único global (bank, approvalNumber)).
create or replace function approval_number_register(p_bank text, p_approval text, p_business_id text)
  returns void
  language sql
  security definer
  set search_path = public
as $$
  insert into "approval_numbers" ("id","bank","approvalNumber","firstBusinessId","firstSeenAt")
  values (gen_random_uuid()::text, p_bank, p_approval, p_business_id, now())
  on conflict ("bank","approvalNumber") do nothing
$$;
