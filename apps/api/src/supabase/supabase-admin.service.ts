import { Injectable, InternalServerErrorException } from "@nestjs/common";

import { env } from "../env";

/** Cliente mínimo de la Admin API de GoTrue (Supabase Auth). No loguea secretos. */
@Injectable()
export class SupabaseAdminService {
  private readonly base = `${env.SUPABASE_URL}/auth/v1`;
  private readonly headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };

  /** Crea un usuario ya confirmado y devuelve su id. */
  async createConfirmedUser(email: string, password: string): Promise<string> {
    const res = await fetch(`${this.base}/admin/users`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!res.ok) {
      throw new InternalServerErrorException(`No se pudo crear el usuario (${res.status})`);
    }
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new InternalServerErrorException("Respuesta de Supabase sin id");
    return body.id;
  }

  /** Borra un usuario de Supabase (rollback/limpieza). */
  async deleteUser(userId: string): Promise<void> {
    await fetch(`${this.base}/admin/users/${userId}`, { method: "DELETE", headers: this.headers });
  }
}
