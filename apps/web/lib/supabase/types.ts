// Tipos de la base de datos para el cliente Supabase del dashboard (Épica 10).
//
// Se declaran a mano (subconjunto) porque la generación automática de tipos requiere
// conexión al proyecto Supabase. Los nombres siguen el schema REAL de Prisma
// (packages/database/prisma/schema.prisma) y sus @@map:
//   - tabla `transactions` (model Transaction, @@map("transactions"))
//   - enum VerdictStatus: VERIFIED | PENDING | SUSPICIOUS
//
// Importante (decisión E10-T2): las FILAS de estas tablas no se leen directo desde el
// cliente Supabase con un login normal, porque la RLS exige el claim `business_id` en el
// JWT (no lo emite el login). Estos tipos existen para tipar el canal Realtime y las
// señales de cambio; los DATOS autoritativos vienen de la API. Ver prd de E10-T2.

/** Veredicto antifraude del semáforo (enum `VerdictStatus` de Prisma). */
export type VerdictStatus = "VERIFIED" | "PENDING" | "SUSPICIOUS";

/** Fila de la tabla `transactions` (subconjunto usado por el dashboard). */
export interface TransactionRow {
  id: string;
  businessId: string;
  voucherId: string;
  verdict: VerdictStatus;
  amountCents: number;
  approvalNumber: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Database {
  public: {
    Tables: {
      transactions: {
        Row: TransactionRow;
        Insert: Partial<TransactionRow>;
        Update: Partial<TransactionRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      VerdictStatus: VerdictStatus;
    };
  };
}
