import { NextResponse } from "next/server";

import { listTodayVouchers } from "@/lib/data/vouchers";

// No cachear: cada consulta refleja el estado actual de los comprobantes del día.
export const dynamic = "force-dynamic";

/**
 * Endpoint interno para el polling del recuadro "Comprobantes de hoy" (E10 mejora).
 * Reusa `listTodayVouchers` (que adjunta el JWT del usuario desde la cookie), así el
 * cliente recibe SOLO los comprobantes de su negocio sin exponer el token.
 */
export async function GET() {
  try {
    const vouchers = await listTodayVouchers();
    return NextResponse.json(vouchers);
  } catch {
    // Ante fallo transitorio (API/sesión), devolver vacío para no romper el polling.
    return NextResponse.json([], { status: 200 });
  }
}
