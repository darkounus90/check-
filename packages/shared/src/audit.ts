/**
 * Auditoría inmutable de accesos a datos sensibles (Épica 12, E12-T6).
 *
 * Objetivo: dejar un registro append-only de QUIÉN accedió a QUÉ dato sensible, CUÁNDO y CÓMO
 * (acción). La tabla `data_access_audits` es append-only a nivel de BD (políticas/trigger en la
 * migración de E12-T6): sin update ni delete, ni siquiera para el rol de servicio.
 *
 * Este módulo define el CONTRATO puro (tipos + normalización del evento). El servicio que
 * persiste el evento vive en `apps/api` (`AuditService`), inyectando un `AuditSink` — así el
 * contrato es testeable sin BD y reutilizable desde workers.
 */

/** Tipos de recurso sensible que se auditan. */
export type AuditResource =
  | "voucher" // comprobante (artefacto en Storage, ocrText, PII del pagador)
  | "voucher_artifact" // descarga del binario del comprobante desde Storage
  | "bank_email" // correo bancario crudo
  | "transaction" // transacción/veredicto
  | "wa_session" // auth-state WhatsApp
  | "data_subject_export" // export de habeas data (E12-T4)
  | "data_subject_delete"; // eliminación de habeas data (E12-T4)

/** Acción ejercida sobre el recurso. */
export type AuditAction = "read" | "list" | "export" | "delete" | "decrypt";

/** Evento de auditoría ya normalizado, listo para persistir/loguear. */
export interface AuditEvent {
  /** Negocio dueño del dato (tenant). Puede ser null para acciones cross-tenant del staff. */
  readonly businessId: string | null;
  /** Actor: usuario Supabase, sistema, o el titular mismo. */
  readonly actorId: string;
  /** Tipo de actor: `user` (miembro del negocio), `system` (worker/job), `data_subject`. */
  readonly actorType: "user" | "system" | "data_subject";
  readonly resource: AuditResource;
  readonly action: AuditAction;
  /** Id del recurso concreto accedido (voucherId, etc.). Null para listados. */
  readonly resourceId: string | null;
  /** Metadatos JSON-serializables adicionales (IP, filtros, conteos…). Sin PII cruda. */
  readonly metadata: Record<string, unknown>;
  /** Momento del acceso (ISO). */
  readonly occurredAt: string;
}

/** Entrada de conveniencia (sin timestamp; lo pone `buildAuditEvent` con el reloj inyectable). */
export interface AuditInput {
  readonly businessId?: string | null;
  readonly actorId: string;
  readonly actorType?: AuditEvent["actorType"];
  readonly resource: AuditResource;
  readonly action: AuditAction;
  readonly resourceId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

/** Reloj inyectable para timestamps deterministas en test. */
export type AuditClock = () => Date;

/** Normaliza una entrada a un `AuditEvent` completo con timestamp. */
export function buildAuditEvent(input: AuditInput, clock: AuditClock = () => new Date()): AuditEvent {
  return {
    businessId: input.businessId ?? null,
    actorId: input.actorId,
    actorType: input.actorType ?? "user",
    resource: input.resource,
    action: input.action,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? {},
    occurredAt: clock().toISOString(),
  };
}

/** Destino de los eventos de auditoría (BD append-only en prod; memoria en test). */
export type AuditSink = (event: AuditEvent) => void | Promise<void>;

/** Sink en memoria para tests: acumula los eventos auditados. */
export function createMemoryAuditSink(): { sink: AuditSink; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return { sink: (event) => void events.push(event), events };
}

/**
 * Auditor: fachada mínima que normaliza y despacha al sink. El sink NUNCA debe hacer fallar la
 * operación auditada de negocio; el llamador decide si envuelve en try/catch. `record` devuelve
 * el evento normalizado por comodidad de test.
 */
export class Auditor {
  constructor(
    private readonly sink: AuditSink,
    private readonly clock: AuditClock = () => new Date(),
  ) {}

  async record(input: AuditInput): Promise<AuditEvent> {
    const event = buildAuditEvent(input, this.clock);
    await this.sink(event);
    return event;
  }
}
