import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EurekaLogo } from "@/components/EurekaLogo";
import { Trophy, Rocket, UserPlus, Hand } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eureka Rocket — Jugá gratis y retirate antes de que explote" },
      { name: "description", content: "Dinámica promocional gratuita de Eureka. 3 intentos por persona. Sin depósito." },
      { property: "og:title", content: "Eureka Rocket — Jugá gratis" },
      { property: "og:description", content: "Participá en Eureka Rocket y competí por premios." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-x-0 top-0 -z-0 h-[60vh]" style={{ background: "var(--gradient-rocket)" }} />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <EurekaLogo size="sm" />
        <Link to="/ranking" className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
          Ranking →
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4">
        <section className="flex flex-col items-center pt-10 text-center sm:pt-16">
          <EurekaLogo size="lg" />
          <div className="mt-8 text-7xl sm:text-9xl animate-rocket-float">🚀</div>

          <h1 className="mt-8 text-5xl font-black uppercase leading-[0.95] tracking-tighter sm:text-7xl">
            <span className="block">Jugá</span>
            <span className="block text-gradient-primary">Gratis</span>
          </h1>

          <p className="mt-4 max-w-xl text-base font-bold uppercase tracking-wide text-muted-foreground sm:text-lg">
            Retirate antes de que explote
          </p>

          <p className="mt-6 max-w-md text-sm text-muted-foreground sm:text-base">
            Participá en <span className="font-bold text-foreground">Eureka Rocket</span> y
            competí por premios. Máximo 3 intentos por persona.
          </p>

          <Button asChild size="lg" className="mt-8 h-14 w-full max-w-sm text-base font-black uppercase tracking-widest animate-pulse-glow">
            <Link to="/entrar">Entrar al juego</Link>
          </Button>

          <p className="mt-4 text-[11px] uppercase tracking-widest text-muted-foreground">
            +18 · Sin depósito · Máximo 3 intentos · Aplican condiciones
          </p>
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="text-center text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">
            ¿Cómo funciona?
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: UserPlus, t: "1. Registrate", d: "Crea tu pase con tus datos." },
              { icon: Rocket, t: "2. Jugá el Rocket", d: "El cohete despega y multiplica." },
              { icon: Hand, t: "3. Retirate", d: "Sacá tu puntaje antes del crash." },
              { icon: Trophy, t: "4. Ranking", d: "Subí al podio y ganá." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="neon-border rounded-xl bg-surface p-5">
                <Icon className="size-6 text-primary" />
                <div className="mt-3 text-sm font-black uppercase tracking-wide">{t}</div>
                <div className="mt-1 text-xs text-muted-foreground">{d}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-20 border-t border-border py-8 text-center text-[11px] leading-relaxed text-muted-foreground">
          <p className="mx-auto max-w-2xl">
            Eureka Rocket es una dinámica promocional gratuita. No requiere depósito.
            Máximo 3 intentos por persona. La organización puede invalidar participaciones
            duplicadas, fraudulentas o sospechosas.
          </p>
        </footer>
      </main>
    </div>
  );
}
