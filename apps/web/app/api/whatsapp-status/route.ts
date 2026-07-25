import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { getWhatsappStatus } from "@/lib/data/whatsapp";

// Sin caché: el QR y el estado cambian en tiempo real mientras se vincula.
export const dynamic = "force-dynamic";

/**
 * Endpoint interno para el polling de la pantalla "Conectar WhatsApp". Consulta el estado
 * a la API (con el JWT del usuario) y, si hay un QR pendiente, lo renderiza a un data URL
 * PNG listo para mostrar como imagen. Así el admin escanea el QR desde el dashboard.
 */
export async function GET() {
  try {
    const status = await getWhatsappStatus();
    const qrDataUrl = status.qr
      ? await QRCode.toDataURL(status.qr, { width: 320, margin: 2 })
      : null;
    return NextResponse.json({
      connected: status.connected,
      qrDataUrl,
      phoneNumber: status.phoneNumber,
    });
  } catch {
    return NextResponse.json(
      { connected: false, qrDataUrl: null, phoneNumber: null },
      { status: 200 },
    );
  }
}
