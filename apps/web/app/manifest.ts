import type { MetadataRoute } from "next";

// NOTA: icon-192.png / icon-512.png son placeholders generados
// programaticamente (cuadro solido con marca central). Reemplazar con
// arte real antes de produccion.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CHECK",
    short_name: "CHECK",
    description: "Verificación antifraude de comprobantes de pago",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
