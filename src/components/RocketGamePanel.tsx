import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  cashOutRocketAttempt,
  getPlayerStatus,
  getRocketState,
  startRocketAttempt,
  type PlayerStatus,
  type RocketState,
} from "@/lib/api";

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
  player: PlayerStatus;
  onPlayerUpdate: (p: PlayerStatus) => void;
}) {
  const [state, setState] = useState<GameState>("idle");
  const [multiplier, setMultiplier] = useState(1.0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      stopPolling();
    },
    [],
  );

  const noAttemptsLeft = player.attemptsUsed >= 3;

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function applyTerminalState(next: RocketState) {
    stopPolling();
    const terminalMultiplier = next.cashedOutAt ?? next.currentMultiplier ?? multiplier;
    setState(next.status === "crashed" ? "exploded" : "cashed_out");
    setMultiplier(terminalMultiplier || 1);
    setResult({
      multiplier: terminalMultiplier || 1,
      score: next.score ?? 0,
      attemptsRemaining: Math.max(0, 3 - player.attemptsUsed),
    });
  }

  async function refreshPlayer() {
    const fresh = await getPlayerStatus();
    if (fresh) onPlayerUpdate(fresh);
    return fresh;
  }

  function startServerPolling(attemptId: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const next = await getRocketState(attemptId);
        if (next.status === "playing") {
          setMultiplier(next.currentMultiplier ?? 1);
          return;
        }

        applyTerminalState(next);
        const fresh = await refreshPlayer();
        if (fresh) {
          setResult((current) =>
            current
              ? { ...current, attemptsRemaining: Math.max(0, 3 - fresh.attemptsUsed) }
              : current,
          );
        }
      } catch {
        setError("No pudimos actualizar el intento.");
      }
    }, 150);
  }

  async function handleStart() {
    try {
      setError(null);
      setResult(null);
      setMultiplier(1.0);
      const attempt = await startRocketAttempt();
      attemptIdRef.current = attempt.attemptId;
      setState("playing");
      startServerPolling(attempt.attemptId);
      const fresh = await refreshPlayer();
      if (fresh) {
        setResult((current) =>
          current
            ? { ...current, attemptsRemaining: Math.max(0, 3 - fresh.attemptsUsed) }
            : current,
        );
      }
    } catch {
      setError("No pudimos iniciar el intento.");
    }
  }

  async function handleCashout() {
    if (!attemptIdRef.current) return;
    try {
      setError(null);
      stopPolling();
      const res = await cashOutRocketAttempt(attemptIdRef.current);
      const cashedMultiplier = res.cashedOutAt ?? res.currentMultiplier ?? multiplier;
      setState(res.status === "crashed" ? "exploded" : "cashed_out");
      setMultiplier(cashedMultiplier || 1);
      setResult({
        multiplier: cashedMultiplier || 1,
        score: res.score ?? 0,
        attemptsRemaining: res.attemptsLeft,
      });
      onPlayerUpdate({
        ...player,
        attemptsUsed: res.attemptsUsed,
        bestScore: res.bestScore,
        bestMultiplier: res.bestMultiplier,
      });
    } catch {
      setError("No pudimos registrar el retiro.");
      startServerPolling(attemptIdRef.current);
    }
  }

  function handleReset() {
    stopPolling();
    setState("idle");
    setMultiplier(1.0);
    setResult(null);
    setError(null);
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

      {error && (
        <p className="relative z-10 mt-4 text-center text-xs font-bold text-destructive">{error}</p>
      )}

      {result && (
        <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 rounded-xl border border-border bg-background/50 p-4 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Retiro
            </div>
            <div className="font-mono text-xl font-black neon-text">
              {result.multiplier.toFixed(2)}x
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Puntaje
            </div>
            <div className="font-mono text-xl font-black">{result.score}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Restantes
            </div>
            <div className="font-mono text-xl font-black">{result.attemptsRemaining}</div>
          </div>
        </div>
      )}
    </div>
  );
}
