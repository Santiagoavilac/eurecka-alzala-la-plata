import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  cashOutRocketAttempt,
  getPlayerStatus,
  getRocketState,
  PLAYER_ATTEMPT_LIMIT,
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

function calculateDisplayMultiplier(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return Math.max(1, Math.pow(1.06, seconds * 10));
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
  const [cashoutPending, setCashoutPending] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const startedAtMsRef = useRef<number | null>(null);
  const serverClockOffsetMsRef = useRef(0);

  useEffect(
    () => () => {
      stopPolling();
      stopAnimation();
      stopMusic();
    },
    [],
  );

  const attemptsLimit = player.attemptsLimit || PLAYER_ATTEMPT_LIMIT;
  const noAttemptsLeft = player.attemptsUsed >= attemptsLimit;

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function stopAnimation() {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }

  function startMusic() {
    if (!musicRef.current) {
      const music = new Audio("/audio/mas-money-mas-cash.mp3");
      music.loop = true;
      music.volume = 1;
      musicRef.current = music;
    }

    void musicRef.current.play().catch(() => undefined);
  }

  function stopMusic() {
    if (!musicRef.current) return;
    musicRef.current.pause();
    musicRef.current.currentTime = 0;
  }

  function syncAttemptClock(startedAt: string, serverTime?: string) {
    const startedAtMs = Date.parse(startedAt);
    if (Number.isFinite(startedAtMs)) {
      startedAtMsRef.current = startedAtMs;
    }

    if (serverTime) {
      const serverNowMs = Date.parse(serverTime);
      if (Number.isFinite(serverNowMs)) {
        serverClockOffsetMsRef.current = serverNowMs - Date.now();
      }
    }
  }

  function startMultiplierAnimation() {
    stopAnimation();

    const tick = () => {
      const startedAtMs = startedAtMsRef.current;
      if (startedAtMs != null) {
        const serverNowMs = Date.now() + serverClockOffsetMsRef.current;
        setMultiplier(calculateDisplayMultiplier(serverNowMs - startedAtMs));
      }
      animationRef.current = window.requestAnimationFrame(tick);
    };

    animationRef.current = window.requestAnimationFrame(tick);
  }

  function applyTerminalState(next: RocketState) {
    stopPolling();
    stopAnimation();
    const terminalMultiplier = next.cashedOutAt ?? next.currentMultiplier ?? multiplier;
    setState(next.status === "crashed" ? "exploded" : "cashed_out");
    setMultiplier(terminalMultiplier || 1);
    setResult({
      multiplier: terminalMultiplier || 1,
      score: next.score ?? 0,
      attemptsRemaining: Math.max(0, attemptsLimit - player.attemptsUsed),
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
          if (next.startedAt) {
            syncAttemptClock(next.startedAt, next.serverTime);
          } else if (next.serverTime && next.currentMultiplier) {
            const serverNowMs = Date.parse(next.serverTime);
            if (Number.isFinite(serverNowMs)) {
              const elapsedMs = (Math.log(next.currentMultiplier) / (10 * Math.log(1.06))) * 1000;
              startedAtMsRef.current = serverNowMs - elapsedMs;
              serverClockOffsetMsRef.current = serverNowMs - Date.now();
            }
          }
          return;
        }

        applyTerminalState(next);
        const fresh = await refreshPlayer();
        if (fresh) {
          setResult((current) =>
            current
              ? {
                  ...current,
                  attemptsRemaining: Math.max(0, fresh.attemptsLimit - fresh.attemptsUsed),
                }
              : current,
          );
        }
      } catch {
        stopPolling();
        setError("No pudimos actualizar el intento.");
      }
    }, 500);
  }

  async function handleStart() {
    try {
      startMusic();
      setError(null);
      setCashoutPending(false);
      setResult(null);
      setMultiplier(1.0);
      const attempt = await startRocketAttempt();
      attemptIdRef.current = attempt.attemptId;
      syncAttemptClock(attempt.startedAt, attempt.serverTime);
      setState("playing");
      startMultiplierAnimation();
      startServerPolling(attempt.attemptId);
      const fresh = await refreshPlayer();
      if (fresh) {
        setResult((current) =>
          current
            ? {
                ...current,
                attemptsRemaining: Math.max(0, fresh.attemptsLimit - fresh.attemptsUsed),
              }
            : current,
        );
      }
    } catch {
      setError("No pudimos iniciar el intento.");
    }
  }

  async function handleCashout() {
    if (!attemptIdRef.current || cashoutPending) return;
    const startedAtMs = startedAtMsRef.current;
    const serverNowMs = Date.now() + serverClockOffsetMsRef.current;
    const requestedAt = new Date(serverNowMs).toISOString();
    const clickedMultiplier =
      startedAtMs == null ? multiplier : calculateDisplayMultiplier(serverNowMs - startedAtMs);
    try {
      setError(null);
      setCashoutPending(true);
      stopPolling();
      stopAnimation();
      setMultiplier(clickedMultiplier);
      const res = await cashOutRocketAttempt(attemptIdRef.current, requestedAt);
      const cashedMultiplier = res.cashedOutAt ?? res.currentMultiplier ?? clickedMultiplier;
      setState(res.status === "crashed" ? "exploded" : "cashed_out");
      setMultiplier(cashedMultiplier || 1);
      setCashoutPending(false);
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
      setCashoutPending(false);
      setError("No pudimos registrar el retiro.");
      startMultiplierAnimation();
      startServerPolling(attemptIdRef.current);
    }
  }

  function handleReset() {
    stopPolling();
    stopAnimation();
    setCashoutPending(false);
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

      <div className="relative z-10 mt-6 flex h-64 items-center justify-center overflow-hidden sm:h-80">
        <div
          className={cn(
            "cash-flight-scene",
            state === "idle" && "cash-flight-scene--idle",
            state === "playing" && "cash-flight-scene--playing",
            state === "exploded" && "cash-flight-scene--exploded",
          )}
        >
          <div className="cash-stars" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="money-trail" aria-hidden="true">
            <span>$</span>
            <span>$</span>
            <span>$</span>
            <span>$</span>
            <span>$</span>
            <span>$</span>
            <span>$</span>
          </div>
          <img
            src="/images/cash-rider.png"
            alt="Personajes Eureka avanzando"
            className="cash-rider"
            draggable={false}
          />
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
            disabled={cashoutPending}
            className="h-14 w-full animate-pulse-glow text-base font-black uppercase tracking-widest"
          >
            {cashoutPending ? "Registrando retiro…" : `Retirarme · ${multiplier.toFixed(2)}x`}
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
