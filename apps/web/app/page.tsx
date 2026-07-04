import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">CHECK</h1>
      <p className="text-slate-600">
        Verificación antifraude de comprobantes de pago. Esqueleto de la Épica 1.
      </p>
      <div className="flex gap-3">
        <Button>Empezar</Button>
        <Button variant="outline">Saber más</Button>
      </div>
    </main>
  );
}
