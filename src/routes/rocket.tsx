import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPlayerStatus, type PlayerStatus } from "@/lib/api";
import { RocketGamePanel } from "@/components/RocketGamePanel";
import { EurekaLogo } from "@/components/EurekaLogo";

export const Route = createFileRoute("/rocket")({
  head: () => ({ meta: [{ title: "Rocket — EUREKA Juegos" }] }),
  component: RocketPage,
});

function RocketPage() {
  const navigate = useNavigate();
  const [player, setPlayer] = useState<PlayerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const currentPlayer = await getPlayerStatus();
        if (!mounted) return;
        if (!currentPlayer) {
          navigate({
            to: "/entrar",
            search: { next: "/rocket" },
          });
          return;
        }
        setPlayer(currentPlayer);
      } catch (error) {
        if (!mounted) return;
        const err = error as { status?: number; message?: string };
        const isAuthError =
          err &&
          (err.status === 401 ||
            err.status === 404 ||
            err.message === "player_id_missing" ||
            err.message === "player_not_found");
        if (isAuthError) {
          navigate({
            to: "/entrar",
            search: { next: "/rocket" },
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void boot();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (loading) {
    return (
      <Shell player={player}>
        <div className="flex min-h-[55vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell player={player}>
      <div className="mx-auto max-w-2xl px-4 py-6">
        {player && (
          <RocketGamePanel player={player} onPlayerUpdate={(updated) => setPlayer(updated)} />
        )}
      </div>
    </Shell>
  );
}

function Shell({ player, children }: { player: PlayerStatus | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/games">
            <EurekaLogo size="sm" />
          </Link>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Jugador
            </div>
            <div className="max-w-36 truncate text-sm font-bold">{player?.name ?? "Invitado"}</div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
