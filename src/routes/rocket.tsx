import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlayerHeader } from "@/components/PlayerHeader";
import { RocketGamePanel } from "@/components/RocketGamePanel";
import { getPlayerStatus, type PlayerStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/rocket")({
  head: () => ({ meta: [{ title: "Eureka Rocket — Jugar" }] }),
  component: RocketPage,
});

function RocketPage() {
  const navigate = useNavigate();
  const [player, setPlayer] = useState<PlayerStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    getPlayerStatus()
      .then((p) => {
        if (!mounted) return;
        if (!p) {
          navigate({ to: "/entrar" });
          return;
        }
        setPlayer(p);
        setReady(true);
      })
      .catch(() => {
        if (mounted) navigate({ to: "/entrar" });
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (!ready || !player) return null;

  return (
    <div className="min-h-screen bg-background">
      <PlayerHeader player={player} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <RocketGamePanel player={player} onPlayerUpdate={setPlayer} />

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            asChild
            variant="outline"
            className="neon-border h-12 font-bold uppercase tracking-widest"
          >
            <Link to="/ranking">Ver ranking</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-12 font-bold uppercase tracking-widest text-muted-foreground"
          >
            <Link to="/">Salir</Link>
          </Button>
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground">
          Eureka Rocket es una dinámica promocional gratuita. Máximo 5 intentos por persona. La
          organización puede invalidar participaciones duplicadas o sospechosas.
        </p>
      </main>
    </div>
  );
}
