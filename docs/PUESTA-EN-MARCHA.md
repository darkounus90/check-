# CHECK — Checklist de puesta en marcha

> Estado del código: **12 épicas completas, tests en verde**. Lo que falta para operar es
> despliegue + credenciales reales + validar WhatsApp con un número de verdad. Este documento
> es el orden para llevarlo de "corre en la máquina" a "prendido en producción".

## 0. Arquitectura de despliegue

Tres procesos desplegables + servicios externos:

```
              ┌─────────────┐   webhook correo    ┌──────────┐
   Cliente ──▶│  WhatsApp   │◀───────────────────│ Postmark │ (buzón bancario)
   (QR /n)    │  (Baileys)  │                     └──────────┘
              └──────┬──────┘
                     │ encola
   Navegador ─▶ apps/web (Next.js, Vercel) ─▶ apps/api (NestJS) ─┐
                                                                  ▼
                                                          Redis (BullMQ)
                                                                  ▼
                                                     apps/workers (NestJS)
                                                     · OCR (Google Vision)
                                                     · 7 defensas antifraude
                                                     · instancia(s) WhatsApp
                                                                  ▼
                                              Supabase Postgres (RLS) + Storage
```

- **apps/web** → Vercel (o cualquier host Next.js 15).
- **apps/api** → host de contenedor/Node siempre-encendido (Railway, Fly, Render, VM…). Expone HTTP.
- **apps/workers** → mismo tipo de host, **proceso long-running** (corre colas + WhatsApp + jobs). NO serverless.
- **Redis** → Upstash u otro Redis gestionado (BullMQ lo exige).
- **Supabase** → Postgres + Auth + Storage (ya en uso en dev).

---

## 1. Prerrequisitos (cuentas/servicios)

- [ ] Proyecto **Supabase** de producción (Postgres + Auth + Storage). Bucket privado `vouchers`.
- [ ] **Redis** gestionado (Upstash) → obtienes `REDIS_URL`.
- [ ] **Google Cloud Vision** habilitado + service account JSON → `GOOGLE_APPLICATION_CREDENTIALS`.
- [ ] **Postmark** con dominio de buzón entrante configurado → `INBOUND_EMAIL_DOMAIN` + secreto del webhook.
- [ ] **Dominio** propio para la web/QR (p.ej. `check.co`) → será `PUBLIC_APP_URL`.
- [ ] Al menos **un número de WhatsApp** dedicado (SIM/eSIM), idealmente 2–3 para el pool.
- [ ] (Opcional) Webhook de **Slack/Discord** para alertas del equipo → `ALERT_WEBHOOK_URL`.

---

## 2. Base de datos (Supabase)

- [ ] Apuntar `DATABASE_URL` (pooler) y `DIRECT_URL` (conexión directa) al proyecto de prod.
- [ ] Aplicar migraciones contra la BD de prod:
      ```bash
      pnpm --filter @check/database exec prisma migrate deploy
      ```
      Incluye las de las Épicas 2–12 (RLS, WhatsApp, QR, auditoría, cifrado, auth hook).
- [ ] **Activar el auth hook** (paso de ops, NO va en migración):
      Supabase Dashboard → **Authentication → Hooks → Custom Access Token** → seleccionar la
      función `public.custom_access_token_hook`. Esto habilita la RLS directa desde el cliente
      (hoy el dashboard funciona igual porque el acceso va mediado por la API, pero activarlo
      cierra el pilar de defensa en profundidad).
- [ ] Verificar RLS activa en las tablas tenant (la revisión E12-T7 ya cubrió `qr_resolution_logs`
      y `wa_voucher_contexts`).

---

## 3. Generar secretos

- [ ] **Clave de cifrado** (E12): la MISMA en `apps/api` y `apps/workers` (comparten BD):
      ```bash
      node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64'))"
      ```
      → pegar en `ENCRYPTION_KEYS`. **Guardar en un gestor de secretos**, no en el repo.
      Sin ella, el cifrado en reposo queda desactivado (solo aceptable en dev).
- [ ] Rotación futura: `ENCRYPTION_KEYS=v2:<nueva>,v1:<vieja>` → recifrar → quitar `v1`.

---

## 4. Variables de entorno por app

Cada app valida su entorno con Zod al arrancar (`apps/*/src/env.ts`) y **falla con mensaje claro**
si falta algo. Referencia completa en los `.env.example`.

### apps/api
| Variable | Obligatoria | Nota |
|---|---|---|
| `SUPABASE_URL` | ✅ | proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Admin API — secreto |
| `DATABASE_URL` | ✅ | pooler |
| `REDIS_URL` | ✅ (default local) | misma instancia que workers |
| `PUBLIC_APP_URL` | ✅ | dominio real (QR apunta aquí) |
| `INBOUND_EMAIL_DOMAIN` | default | dominio del buzón |
| `POSTMARK_INBOUND_SECRET` | default | secreto del webhook |
| `ENCRYPTION_KEYS` | ✅ en prod | cifrado en reposo |
| `ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_STYLE` | opcional | alertas a Slack/Discord |
| `PORT` | default 3001 | |

### apps/workers
| Variable | Obligatoria | Nota |
|---|---|---|
| `DATABASE_URL` | ✅ | |
| `REDIS_URL` | ✅ | |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ | |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ | ruta al JSON de Vision |
| `ENCRYPTION_KEYS` | ✅ en prod | **igual que api** |
| `WHATSAPP_ENABLED` | ✅ | `true` para activar WhatsApp |
| `WHATSAPP_WA_NUMBER_ID` | si `ENABLED=true` | id de la fila `WaNumber` |
| `WHATSAPP_BUSINESS_START_HOUR`/`END_HOUR`/`UTC_OFFSET_MINUTES` | opcional | horario (si no, 24/7) |
| `HEALTH_PORT` | default 3002 | endpoint de salud |
| `RETENTION_*` | default | ventanas de retención |
| `QUEUE_MONITOR_*` | default | umbrales de alertas de cola |

### apps/web
| Variable | Obligatoria | Nota |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | URL pública de apps/api |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | pública por diseño (la RLS protege) |

---

## 5. Desplegar

- [ ] `pnpm install && pnpm build` verde (ya lo está).
- [ ] **web** → Vercel: root del monorepo, build `pnpm --filter @check/web build`, env `NEXT_PUBLIC_*`.
- [ ] **api** → host Node: `pnpm --filter @check/api build` + `node dist/main.js` (o el start del paquete).
- [ ] **workers** → host Node long-running: build + start. Confirmar que NO es serverless (mantiene
      conexiones WhatsApp + colas vivas).
- [ ] CORS: `apps/api/src/main.ts` restringe orígenes (E12-T7) — añadir el dominio real de la web.

---

## 6. Puesta en marcha de WhatsApp (⚠️ el paso más delicado)

> Baileys es un cliente **no oficial**. Nunca se ha probado contra WhatsApp real en este proyecto
> (todo el testing fue con el socket mockeado). Hacer esto con cuidado.

- [ ] Crear la(s) fila(s) `WaNumber` en la BD (una por número) y su asignación a negocios
      (`NumberPoolAssignment`).
- [ ] Arrancar `apps/workers` con `WHATSAPP_ENABLED=true` y `WHATSAPP_WA_NUMBER_ID=<id>`.
- [ ] **Vincular el número**: el QR de vinculación inicial se emite **por log del `WhatsAppManager`**.
      Escanearlo desde el WhatsApp del número (Dispositivos vinculados) la primera vez. La sesión
      queda persistida y cifrada en `WaSession.authState` → no hay que re-escanear en reinicios.
- [ ] **Warmeo antes de producción**: un número nuevo NO debe recibir tráfico real de golpe. El motor
      de warmeo (E07-T6) limita 20/h el día 1 → 60/h la semana 2 → 200/h, y no entra al pool hasta
      cumplir ~2 semanas. Respetarlo o arriesgas baneo.
- [ ] Verificar health del número: endpoint de workers `/health` (`HEALTH_PORT`) y `WaNumber.health`.

---

## 7. Verificación post-deploy

- [ ] `GET https://<api>/health` y `/health/ready` → ok (DB + Redis reachable).
- [ ] `GET http://<workers>:<HEALTH_PORT>/health/ready` → ok.
- [ ] Login en el dashboard con un usuario dueño → ve histórico/alertas/cuentas; un cajero NO ve
      vistas de dueño.
- [ ] Generar el QR de un negocio (dashboard dueño → `/dashboard/qr`) e imprimirlo/escanearlo.
- [ ] **Prueba E2E real**: escanear el QR → abre WhatsApp con el número → mandar una foto de un
      comprobante real → recibir 🟡 y luego 🟢/🚨. Confirmar que el correo del banco llegó a Postmark
      y disparó la Defensa 1.
- [ ] **Fallback**: con todos los números del negocio caídos, el `/n/{opaqueId}` debe caer a la PWA
      de subida web y resolver igual.

---

## 8. Riesgos y notas

- **WhatsApp/Baileys sin validar en vivo**: es el mayor riesgo. Probar primero con un número de
  prueba y volumen bajo; vigilar `WaNumber.health` por baneos.
- **Cifrado**: si activas `ENCRYPTION_KEYS` con datos ya escritos en claro, el sobre autoprefijado
  (`enc:vN:`) permite convivencia — se cifra al reescribir. No hay migración masiva automática.
- **Auth hook**: mientras no lo actives en Supabase, la RLS directa desde el cliente queda inerte;
  el acceso mediado por API es seguro, pero es defensa en un solo punto.
- **Tests de integración** (`*-e2e.ts`): corren aparte con `pnpm --filter @check/api test:integration`
  y requieren `.env` con servicios reales; no van en el `pnpm test` unitario.
- **Postmark inbound**: configurar el dominio MX + el webhook apuntando a `apps/api` con el secreto.
