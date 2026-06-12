import { Link } from "@tanstack/react-router";
import { EurekaLogo } from "./EurekaLogo";
import type { PlayerStatus } from "@/lib/api";

export function PlayerHeader({
  player,
  attemptsLimit = 3,
}: {
  player: PlayerStatus | null;
  attemptsLimit?: number;
}) {
  const remaining = player ? attemptsLimit - player.attemptsUsed : attemptsLimit;
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <Link to="/" className="min-w-0 truncate">
          <EurekaLogo size="sm" />
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          {player && (
            <div className="hidden text-right sm:block">
              <div className="truncate text-xs uppercase tracking-widest text-muted-foreground">
                Jugador
              </div>
              <div className="truncate text-sm font-bold">{player.name}</div>
            </div>
          )}
          <div className="neon-border rounded-lg bg-surface px-3 py-1.5 text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Intentos
            </div>
            <div className="font-mono text-sm font-black neon-text">
              {remaining}/{attemptsLimit}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
