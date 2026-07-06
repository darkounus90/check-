/**
 * Humanización anti-baneo (E07-T4). Envuelve el envío de texto de la instancia con
 * patrones que imitan a una persona: un delay aleatorio antes de responder, presencia
 * "escribiendo…" durante ese delay, marcado del mensaje entrante como leído con un pequeño
 * retardo, y respeto del horario del negocio (fuera de horario NO se responde: se pospone).
 *
 * TODO el comportamiento temporal/aleatorio se inyecta (`clock`, `random`, `sleep`) para
 * que los tests puedan FIJAR el reloj y la aleatoriedad y verificar deterministamente que
 * los delays y la presencia ocurren. Nunca se usa `Date.now()`/`Math.random()`/`setTimeout`
 * directos aquí.
 *
 * Principio inviolable: nunca hay outbound espontáneo. Este módulo SOLO retrasa/pospone un
 * envío que ya fue disparado por un mensaje entrante o por un veredicto resuelto; jamás
 * origina un mensaje por su cuenta.
 */

/** Reloj inyectable (en ms epoch). En prod es `() => Date.now()`; en test se fija. */
export type Clock = () => number;

/** Fuente de aleatoriedad inyectable en `[0, 1)`. En prod `Math.random`; en test se fija. */
export type Random = () => number;

/** Espera inyectable de `ms` milisegundos. En prod usa `setTimeout`; en test se instrumenta. */
export type Sleep = (ms: number) => Promise<void>;

/** Ventana horaria del negocio [inicio, fin) en horas locales (0–24). */
export interface BusinessHours {
  /** Hora de apertura (inclusive), 0–23. */
  readonly startHour: number;
  /** Hora de cierre (exclusive), 1–24. */
  readonly endHour: number;
  /**
   * Offset de zona horaria del negocio en minutos respecto de UTC (ej. Colombia = -300).
   * Se aplica sobre el epoch del `clock` para obtener la hora local del negocio sin
   * depender de la TZ del proceso. Por defecto -300 (America/Bogota, UTC-5, sin DST).
   */
  readonly utcOffsetMinutes?: number;
}

/** Parámetros de temporización de la humanización (E07-T4). Todos con defaults razonables. */
export interface HumanizerTiming {
  /** Delay mínimo antes de enviar (ms). Default 1000 (1s). */
  readonly minSendDelayMs?: number;
  /** Delay máximo antes de enviar (ms). Default 4000 (4s). */
  readonly maxSendDelayMs?: number;
  /** Delay antes de marcar leído el mensaje entrante (ms). Default 500. */
  readonly readDelayMs?: number;
}

/** Dependencias inyectables del humanizador. */
export interface HumanizerDeps {
  readonly clock: Clock;
  readonly random: Random;
  readonly sleep: Sleep;
  /** Horario del negocio; si se omite, se responde 24/7 (sin restricción de horario). */
  readonly businessHours?: BusinessHours;
  readonly timing?: HumanizerTiming;
}

/** Efectos que el humanizador orquesta sobre la instancia (los provee `WhatsAppInstance`). */
export interface HumanizerEffects {
  /** Envía "escribiendo…"/pausa la presencia en el chat (`composing`/`paused`). */
  setPresence(to: string, presence: "composing" | "paused"): Promise<void>;
  /** Marca como leído el mensaje entrante (a quién y qué mensaje). */
  markRead(to: string): Promise<void>;
  /** Envío real del texto (el `sendMessage` crudo, ya sin humanización). */
  deliver(to: string, body: string): Promise<void>;
}

const DEFAULT_TIMING = {
  minSendDelayMs: 1000,
  maxSendDelayMs: 4000,
  readDelayMs: 500,
} as const;

const DEFAULT_UTC_OFFSET_MINUTES = -300; // America/Bogota (UTC-5)

/** `sleep` real basada en `setTimeout`, para producción. */
export const realSleep: Sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Calcula la hora local (0–23) del negocio a partir de un epoch ms y un offset de TZ.
 * Independiente de la zona horaria del proceso.
 */
export function localHourOf(epochMs: number, utcOffsetMinutes: number): number {
  const localMs = epochMs + utcOffsetMinutes * 60_000;
  const hour = Math.floor(localMs / 3_600_000) % 24;
  return hour < 0 ? hour + 24 : hour;
}

/**
 * Indica si `epochMs` cae dentro del horario del negocio. Sin `businessHours` configurado,
 * siempre es `true` (24/7). Soporta ventanas normales (`start < end`, ej. 8–20) y ventanas
 * que cruzan medianoche (`start > end`, ej. 20–6).
 */
export function isWithinBusinessHours(epochMs: number, hours: BusinessHours | undefined): boolean {
  if (!hours) return true;
  const offset = hours.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;
  const hour = localHourOf(epochMs, offset);
  if (hours.startHour === hours.endHour) return true; // ventana degenerada = 24/7
  if (hours.startHour < hours.endHour) {
    return hour >= hours.startHour && hour < hours.endHour;
  }
  // Ventana que cruza medianoche (ej. 20 → 6).
  return hour >= hours.startHour || hour < hours.endHour;
}

/**
 * Humanizador anti-baneo (E07-T4). Orquesta leído-con-delay + presencia "escribiendo…" +
 * delay aleatorio 1–4s + envío, respetando el horario del negocio.
 */
export class Humanizer {
  private readonly minSendDelayMs: number;
  private readonly maxSendDelayMs: number;
  private readonly readDelayMs: number;

  constructor(private readonly deps: HumanizerDeps) {
    const t = deps.timing ?? {};
    this.minSendDelayMs = t.minSendDelayMs ?? DEFAULT_TIMING.minSendDelayMs;
    this.maxSendDelayMs = t.maxSendDelayMs ?? DEFAULT_TIMING.maxSendDelayMs;
    this.readDelayMs = t.readDelayMs ?? DEFAULT_TIMING.readDelayMs;
  }

  /** Instante actual (epoch ms) según el reloj inyectado. Fuente única de "ahora". */
  clockNow(): number {
    return this.deps.clock();
  }

  /** `true` si en este instante (según el reloj inyectado) el negocio está en horario. */
  isOpenNow(): boolean {
    return isWithinBusinessHours(this.deps.clock(), this.deps.businessHours);
  }

  /**
   * Delay aleatorio de envío en `[min, max]` ms, derivado de la aleatoriedad inyectada
   * (por eso es fijable en test). Redondeado a ms entero.
   */
  pickSendDelayMs(): number {
    const span = this.maxSendDelayMs - this.minSendDelayMs;
    return Math.round(this.minSendDelayMs + this.deps.random() * span);
  }

  /**
   * Marca leído un mensaje entrante con un pequeño delay humano (E07-T4). Se llama al
   * recibir el comprobante, ANTES de acusar. Nunca origina outbound: solo un "read receipt".
   */
  async markReadHumanized(to: string, effects: HumanizerEffects): Promise<void> {
    await this.deps.sleep(this.readDelayMs);
    await effects.markRead(to);
  }

  /**
   * Envía `body` a `to` con comportamiento humanizado (E07-T4):
   * 1. Si el negocio está FUERA de horario, NO envía y devuelve `false` (el llamador puede
   *    posponer/encolar; nunca se responde a deshora).
   * 2. Emite presencia "escribiendo…".
   * 3. Espera un delay aleatorio 1–4s (durante el cual la presencia sigue activa).
   * 4. Pausa la presencia y entrega el mensaje.
   *
   * Devuelve `true` si entregó, `false` si lo pospuso por horario.
   */
  async send(to: string, body: string, effects: HumanizerEffects): Promise<boolean> {
    if (!this.isOpenNow()) return false;

    await effects.setPresence(to, "composing");
    await this.deps.sleep(this.pickSendDelayMs());
    await effects.setPresence(to, "paused");
    await effects.deliver(to, body);
    return true;
  }
}
