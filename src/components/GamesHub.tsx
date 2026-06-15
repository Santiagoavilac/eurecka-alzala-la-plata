import { Link } from "@tanstack/react-router";
import { Brain, ChevronRight, Clock, ShieldCheck, Trophy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EurekaLogo } from "@/components/EurekaLogo";

export function GamesHub() {
  return (
    <div className="min-h-screen bg-background">
      <div
        className="absolute inset-x-0 top-0 -z-0 h-[55vh]"
        style={{ background: "var(--gradient-rocket)" }}
      />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <EurekaLogo size="sm" />
        <Link
          to="/ranking"
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Ranking
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-12">
        <section className="pt-10 sm:pt-16">
          <div className="max-w-2xl">
            <EurekaLogo size="lg" />
            <h1 className="mt-8 text-5xl font-black uppercase leading-[0.95] tracking-tighter sm:text-7xl">
              Plataforma de <span className="text-gradient-primary">juegos</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Entrá con tu nombre y teléfono, jugá dinámicas rápidas y competí por puntajes.
            </p>
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="neon-border rounded-2xl bg-surface p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Brain className="size-7" />
                </div>
                <h2 className="mt-6 text-3xl font-black uppercase tracking-tighter sm:text-4xl">
                  Adivina el jugador
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Tenés 5 preguntas. En cada una vas a ver club, país y posición. Escribí el nombre
                  correcto antes de que termine el tiempo.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center sm:w-44">
                <Stat label="Preguntas" value="5" />
                <Stat label="Tiempo" value="7s" />
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Clock, title: "Rápido", text: "7 segundos por pista." },
                { icon: ShieldCheck, title: "Seguro", text: "Validación en backend." },
                { icon: Trophy, title: "Resultado", text: "Score final sobre 5." },
              ].map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="rounded-xl border border-border/70 bg-background/45 p-4"
                >
                  <Icon className="size-5 text-primary" />
                  <div className="mt-3 text-xs font-black uppercase tracking-widest">{title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{text}</div>
                </div>
              ))}
            </div>

            <Button
              asChild
              size="lg"
              className="mt-8 h-14 w-full text-base font-black uppercase tracking-widest sm:w-auto"
            >
              <Link to="/games/adivina-el-jugador">
                Jugar <ChevronRight className="ml-1 size-5" />
              </Link>
            </Button>
          </article>

          <aside className="rounded-2xl border border-border/70 bg-surface/70 p-6">
            <UserPlus className="size-7 text-primary" />
            <h2 className="mt-5 text-xl font-black uppercase tracking-tighter">Tu pase</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Si todavía no entraste, creá tu pase con nombre y teléfono. Ese mismo pase sirve para
              los juegos activos de la plataforma.
            </p>
            <Button
              asChild
              variant="outline"
              className="neon-border mt-6 w-full font-bold uppercase"
            >
              <Link to="/entrar">Crear mi pase</Link>
            </Button>
          </aside>
        </section>

        <footer className="mt-14 border-t border-border py-8 text-center text-[11px] leading-relaxed text-muted-foreground">
          <p className="mx-auto max-w-2xl">
            EUREKA Juegos es una plataforma de dinámicas promocionales. La organización puede
            invalidar participaciones duplicadas, fraudulentas o sospechosas.
          </p>
        </footer>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 p-3">
      <div className="font-mono text-2xl font-black neon-text">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
