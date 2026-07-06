import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { env } from "./env";

/** Forma mínima de la respuesta Express que usamos (evita depender de los tipos de `express`). */
interface SecurableResponse {
  setHeader(name: string, value: string): void;
  removeHeader(name: string): void;
}

/**
 * Cabeceras de seguridad HTTP (Épica 12, E12-T7). Equivalente mínimo a helmet sin añadir una
 * dependencia: endurece la respuesta de la API contra clickjacking, MIME-sniffing y fuga de
 * referrer. La API es JSON puro (no sirve HTML), así que no necesita CSP de scripts.
 */
function securityHeaders(_req: unknown, res: SecurableResponse, next: () => void): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // No revelar el motor detrás de la API.
  res.removeHeader("X-Powered-By");
  next();
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // E12-T7: cabeceras de seguridad en cada respuesta.
  app.use(securityHeaders);

  // E12-T7: CORS restringido al origen del dashboard/PWA (PUBLIC_APP_URL). Sin comodín en
  // producción: solo el front conocido puede llamar la API con credenciales.
  app.enableCors({
    origin: env.NODE_ENV === "production" ? [env.PUBLIC_APP_URL] : true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.listen(env.PORT);

  console.log(`[api] escuchando en http://localhost:${env.PORT}`);
}

void bootstrap();
