"use client";

import { useEffect } from "react";

// Registra el service worker del app shell (public/sw.js). Se monta una vez
// desde el layout raiz; no renderiza nada.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Fallo silencioso: el registro del service worker es progresivo, no
      // debe romper la carga de la app si falla (p.ej. navegador sin soporte).
    });
  }, []);

  return null;
}
