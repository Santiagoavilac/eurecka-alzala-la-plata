import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { startRocketAttempt, cashOutRocketAttempt } from "@/lib/api";
import { updateMockPlayer, type MockPlayer } from "@/lib/player";

type GameState = "idle" | "playing" | "cashed_out" | "exploded";

interface Result {
  multiplier: number;
  score: number;
  attemptsRemaining: number;
}

export function RocketGamePanel({
  player,
  onPlayerUpdate,
}: {
  player: MockPlayer;
  onPlayerUpdate: (p: MockPlayer) => void;
}) {
  const [state, setState] = useState<GameState>("idle");
  const [multiplier, setMultiplier] = useState(1.0);
  const [result, setResult] = useState<Result | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const noAttemptsLeft = player.attemptsUsed >= 3;

  // ⚠️ Animación PURAMENTE VISUAL. El crash real lo decide el backend.
  // No existe variable `crashPoint` aquí — el cliente sólo muestra un número creciente.
  function startVisualLoop() {
    startRef.current = performance.now();
    const tick = (now: number) => {
      const t = (now - startRef.current) / 1000;
      const m = +(Math.pow(1.06, t * 10)).toFixed(2);
      setMultiplier(m);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function handleStart() {
    setResult(null);
    setMultiplier(1.0);
    const { attemptId } = await startRocketAttempt();
    attemptIdRef.current = attemptId;
    setState("playing");
    startVisualLoop();
  }

  async function handleCashout() {
    if (!attemptIdRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const res = await cashOutRocketAttempt(attemptIdRef.current, multiplier);
    setState("cashed_out");
    const newUsed = player.attemptsUsed + 1;
    const updated = updateMockPlayer({
      attemptsUsed: newUsed,
      bestScore: Math.max(player.bestScore, res.score ?? 0),
      bestMultiplier: Math.max(player.bestMultiplier, res.multiplier ?? 0),
    });
    if (updated) onPlayerUpdate(updated);
    setResult({
      multiplier: res.multiplier ?? multiplier,
      score: res.score ?? 0,
      attemptsRemaining: 3 - newUsed,
    });
  }

  function handleReset() {
    setState("idle");
    setMultiplier(1.0);
    setResult(null);
  }

  const statusLabel: Record<GameState, string> = {
    idle: "Esperando",
    playing: "Volando",
    cashed_out: "Retirado",
    exploded: "Explotó",
  };

  return (
    <div className="neon-border relative overflow-hidden rounded-2xl bg-surface p-5 sm:p-8">
      <div className="absolute inset-0 -z-0" style={{ background: "var(--gradient-rocket)" }} />

      <div className="relative z-10 flex items-center justify-between">
        <Badge variant="outline" className="neon-border bg-background/40 uppercase tracking-widest">
          {statusLabel[state]}
        </Badge>
        <span className="font-mono text-xs text-muted-foreground">EUREKA · ROCKET</span>
      </div>

      <div className="relative z-10 mt-6 flex h-64 items-center justify-center sm:h-80">
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 text-6xl sm:text-8xl",
            state === "idle" && "animate-rocket-float",
            state === "playing" && "animate-rocket-fly",
            state === "exploded" && "opacity-40",
          )}
        >
          🚀
          {state === "playing" && (
            <div className="absolute left-1/2 top-full h-10 w-3 -translate-x-1/2 animate-thrust rounded-b-full bg-gradient-to-b from-primary to-transparent" />
          )}
        </div>
      </div>

      <div className="relative z-10 text-center">
        <div
          className={cn(
            "font-mono text-7xl font-black tabular-nums tracking-tighter sm:text-8xl",
            state === "playing" && "neon-text animate-pulse-glow",
            state === "cashed_out" && "neon-text",
            state === "exploded" && "text-destructive",
          )}
        >
          {multiplier.toFixed(2)}x
        </div>
      </div>

      <div className="relative z-10 mt-6">
        {state === "idle" && (
          <Button
            size="lg"
            disabled={noAttemptsLeft}
            onClick={handleStart}
            className="h-14 w-full text-base font-black uppercase tracking-widest"
          >
            {noAttemptsLeft ? "Sin intentos" : "Iniciar intento"}
          </Button>
        )}
        {state === "playing" && (
          <Button
            size="lg"
            onClick={handleCashout}
            className="h-14 w-full animate-pulse-glow text-base font-black uppercase tracking-widest"
          >
            Retirarme · {multiplier.toFixed(2)}x
          </Button>
        )}
        {(state === "cashed_out" || state === "exploded") && (
          <Button
            size="lg"
            variant="outline"
            disabled={result?.attemptsRemaining === 0}
            onClick={handleReset}
            className="neon-border h-14 w-full text-base font-black uppercase tracking-widest"
          >
            {result?.attemptsRemaining === 0 ? "Sin intentos" : "Jugar otra vez"}
          </Button>
        )}
      </div>

      {result && (
        <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 rounded-xl border border-border bg-background/50 p-4 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Retiro</div>
            <div className="font-mono text-xl font-black neon-text">{result.multiplier.toFixed(2)}x</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Puntaje</div>
            <div className="font-mono text-xl font-black">{result.score}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Restantes</div>
            <div className="font-mono text-xl font-black">{result.attemptsRemaining}</div>
          </div>
        </div>
      )}
    </div>
  );
}
