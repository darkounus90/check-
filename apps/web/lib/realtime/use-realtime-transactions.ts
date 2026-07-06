"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TransactionRow } from "@/lib/supabase/types";

/** Estado de conexión del canal Realtime, expuesto por el hook. */
export type RealtimeStatus = "connecting" | "connected" | "disconnected";

export interface UseRealtimeTransactionsOptions {
  /** Negocio del usuario (resuelto server-side). El canal se aísla por este id. */
  businessId: string;
  /**
   * Se dispara en CADA cambio de `transactions` del negocio. Es una SEÑAL de
   * "algo cambió" para que el consumidor haga refetch por la API (fuente de verdad).
   * No confíes en el payload de la fila como datos autoritativos: la RLS de Realtime
   * usa el mismo JWT sin claim `business_id`, así que el payload puede no llegar.
   */
  onChange?: (payload: Partial<TransactionRow>) => void;
  /** Permite desactivar la suscripción (p. ej. mientras no hay businessId). */
  enabled?: boolean;
}

export interface UseRealtimeTransactionsResult {
  status: RealtimeStatus;
}

/** Reconexión: espera creciente acotada (1s, 2s, 4s… máx 30s). */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/**
 * Suscripción base a Supabase Realtime (E10-T2): un canal por negocio que escucha los
 * cambios de la tabla `transactions` del `businessId` del usuario, con reconexión.
 * Listo para E10-T4/T5 (estado en vivo del comprobante + notificación al cajero).
 *
 * Nunca se loguean tokens ni claims.
 */
export function useRealtimeTransactions(
  options: UseRealtimeTransactionsOptions,
): UseRealtimeTransactionsResult {
  const { businessId, onChange, enabled = true } = options;
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");

  // Ref para que cambiar `onChange` no re-cree el canal.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || !businessId) {
      setStatus("disconnected");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;

    const subscribe = (): void => {
      setStatus("connecting");

      channel = supabase
        .channel(`transactions:${businessId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `businessId=eq.${businessId}`,
          },
          (payload) => {
            onChangeRef.current?.(payload.new as Partial<TransactionRow>);
          },
        )
        .subscribe((channelStatus) => {
          if (cancelled) return;

          if (channelStatus === "SUBSCRIBED") {
            attempt = 0;
            setStatus("connected");
            return;
          }

          if (
            channelStatus === "CHANNEL_ERROR" ||
            channelStatus === "TIMED_OUT" ||
            channelStatus === "CLOSED"
          ) {
            setStatus("disconnected");
            scheduleReconnect();
          }
        });
    };

    const scheduleReconnect = (): void => {
      if (cancelled || reconnectTimer) return;
      const delay = backoffMs(attempt);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (cancelled) return;
        if (channel) {
          void supabase.removeChannel(channel);
          channel = null;
        }
        subscribe();
      }, delay);
    };

    subscribe();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [businessId, enabled]);

  return { status };
}
