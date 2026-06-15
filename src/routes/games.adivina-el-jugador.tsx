import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EurekaLogo } from "@/components/EurekaLogo";
import { playGameMusic, playRequestedGameMusic } from "@/lib/game-audio";
import {
  apiErrorMessage,
  getGuessPlayerCurrentQuestion,
  getGuessPlayerResult,
  getPlayerStatus,
  startGuessPlayerSession,
  submitGuessPlayerAnswer,
  type GuessPlayerAnswerResult,
  type GuessPlayerResult,
  type GuessPlayerSessionState,
  type PlayerStatus,
} from "@/lib/api";

export const Route = createFileRoute("/games/adivina-el-jugador")({
  head: () => ({ meta: [{ title: "Adivina el jugador — EUREKA Juegos" }] }),
  component: GuessPlayerPage,
});

function GuessPlayerPage() {
  const navigate = useNavigate();
  const [player, setPlayer] = useState<PlayerStatus | null>(null);
  const [session, setSession] = useState<GuessPlayerSessionState | null>(null);
  const [result, setResult] = useState<GuessPlayerResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<GuessPlayerAnswerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const autoSubmittedRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const currentPlayer = await getPlayerStatus();
        if (!mounted) return;
        if (!currentPlayer) {
          navigate({
            to: "/entrar",
            search: { next: "/games/adivina-el-jugador" },
          });
          return;
        }
        setPlayer(currentPlayer);
        const started = await startGuessPlayerSession();
        if (!mounted) return;
        setSession(started);
        const musicStatus = await playRequestedGameMusic();
        if (mounted && musicStatus === "blocked") {
          setAudioBlocked(true);
        }
        if (started.status !== "active" || !started.currentQuestion) {
          setResult(await getGuessPlayerResult(started.sessionId));
        }
      } catch (error) {
        if (mounted) setError(apiErrorMessage(error, "guess_player_start_failed"));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void boot();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const currentQuestion = session?.currentQuestion ?? null;
  const remainingMs = useMemo(() => {
    if (!currentQuestion) return 0;
    const startedAt = new Date(currentQuestion.startedAt).getTime();
    return Math.max(0, startedAt + currentQuestion.timeLimitSeconds * 1000 - now);
  }, [currentQuestion, now]);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progress = currentQuestion
    ? (remainingMs / (currentQuestion.timeLimitSeconds * 1000)) * 100
    : 0;

  const refreshCurrent = useCallback(async (sessionId: string) => {
    const next = await getGuessPlayerCurrentQuestion(sessionId);
    setSession(next);
    setNow(Date.now());
    if (next.status !== "active" || !next.currentQuestion) {
      setResult(await getGuessPlayerResult(sessionId));
    }
  }, []);

  const syncCurrentQuestion = useCallback(async () => {
    if (!session || session.status !== "active" || result || submitting) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      await refreshCurrent(session.sessionId);
    } catch (error) {
      setError(apiErrorMessage(error, "guess_player_refresh_failed"));
    } finally {
      refreshingRef.current = false;
    }
  }, [refreshCurrent, result, session, submitting]);

  const submitCurrentAnswer = useCallback(
    async (value = answer) => {
      if (!session?.currentQuestion || submitting) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      setSubmitting(true);
      setError(null);
      try {
        const response = await submitGuessPlayerAnswer({
          sessionId: session.sessionId,
          questionId: session.currentQuestion.questionId,
          answer: trimmed,
        });
        setFeedback(response.currentQuestion ? null : response);
        setSession(response);
        setAnswer("");
        setNow(Date.now());
        autoSubmittedRef.current = null;
        if (response.status !== "active" || !response.currentQuestion) {
          setResult(await getGuessPlayerResult(response.sessionId));
        }
      } catch (error) {
        setError(apiErrorMessage(error, "guess_player_answer_failed"));
        await refreshCurrent(session.sessionId);
      } finally {
        setSubmitting(false);
      }
    },
    [answer, refreshCurrent, session, submitting],
  );

  useEffect(() => {
    if (!session || session.status !== "active" || result) return;
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void syncCurrentQuestion();
      }
    };
    const handleFocus = () => void syncCurrentQuestion();

    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncCurrentQuestion();
      }
    }, 1_500);

    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      window.clearInterval(interval);
    };
  }, [result, session, syncCurrentQuestion]);

  useEffect(() => {
    if (!session || !currentQuestion || feedback || submitting || result) return;
    if (remainingMs > 0) return;
    if (autoSubmittedRef.current === currentQuestion.questionId) return;
    autoSubmittedRef.current = currentQuestion.questionId;
    void submitCurrentAnswer("sin respuesta");
  }, [currentQuestion, feedback, remainingMs, result, session, submitting, submitCurrentAnswer]);

  async function retryAudio() {
    const played = await playGameMusic();
    setAudioBlocked(!played);
  }

  async function restart() {
    setLoading(true);
    setError(null);
    setFeedback(null);
    setResult(null);
    try {
      const started = await startGuessPlayerSession();
      setSession(started);
      if (started.status !== "active" || !started.currentQuestion) {
        setResult(await getGuessPlayerResult(started.sessionId));
      }
    } catch (error) {
      setError(apiErrorMessage(error, "guess_player_refresh_failed"));
    } finally {
      setLoading(false);
    }
  }

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
        {error && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-bold text-destructive">
            {error}
          </div>
        )}
        {audioBlocked && (
          <Button
            onClick={retryAudio}
            variant="outline"
            className="neon-border mb-4 h-11 w-full font-black uppercase tracking-widest"
          >
            Activar música
          </Button>
        )}

        {result ? (
          <ResultPanel result={result} onRestart={restart} />
        ) : currentQuestion ? (
          <section className="neon-border rounded-2xl bg-surface p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="outline" className="neon-border uppercase tracking-widest">
                Pregunta {currentQuestion.questionOrder}/{currentQuestion.totalQuestions}
              </Badge>
              <div className="inline-flex items-center gap-2 font-mono text-lg font-black neon-text">
                <Clock className="size-5" />
                {remainingSeconds}s
              </div>
            </div>

            <Progress value={progress} className="mt-5 h-2" />

            <div className="mt-8 grid gap-3">
              <Hint label="Club" value={currentQuestion.club} />
              <Hint label="País" value={currentQuestion.country} />
              <Hint label="Posición" value={currentQuestion.position} />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitCurrentAnswer();
              }}
              className="mt-7 space-y-3"
            >
              <Input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                disabled={submitting}
                placeholder="Escribí el nombre del jugador"
                className="h-14 border-border bg-background text-base"
              />
              <Button
                type="submit"
                disabled={!answer.trim() || submitting}
                className="h-13 w-full font-black uppercase tracking-widest"
              >
                {submitting ? "Enviando..." : "Responder"}
              </Button>
            </form>

            {feedback && (
              <div className="mt-5 rounded-xl border border-border bg-background/55 p-4">
                <div className="flex items-start gap-3">
                  {feedback.isCorrect ? (
                    <CheckCircle2 className="mt-0.5 size-6 text-primary" />
                  ) : (
                    <XCircle className="mt-0.5 size-6 text-destructive" />
                  )}
                  <div>
                    <div className="font-black uppercase tracking-wide">
                      {feedback.expired
                        ? "Se acabó el tiempo"
                        : feedback.isCorrect
                          ? "Correcto"
                          : "Incorrecto"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Respuesta:{" "}
                      <span className="font-bold text-foreground">{feedback.correctAnswer}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <ResultPanel
            result={{
              sessionId: session?.sessionId ?? "",
              status: "completed",
              score: session?.score ?? 0,
              correctAnswers: session?.score ?? 0,
              totalQuestions: session?.totalQuestions ?? 5,
              startedAt: "",
              completedAt: null,
              questions: [],
            }}
            onRestart={restart}
          />
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

function Hint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/45 p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-black uppercase tracking-tight">{value}</div>
    </div>
  );
}

function ResultPanel({ result, onRestart }: { result: GuessPlayerResult; onRestart: () => void }) {
  return (
    <section className="neon-border rounded-2xl bg-surface p-5 sm:p-7">
      <Badge variant="outline" className="neon-border uppercase tracking-widest">
        Resultado final
      </Badge>
      <h1 className="mt-6 text-5xl font-black uppercase tracking-tighter">
        {result.correctAnswers}/{result.totalQuestions}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Respuestas correctas en Adivina el jugador.
      </p>

      {result.questions.length > 0 && (
        <div className="mt-6 space-y-2">
          {result.questions.map((question) => (
            <div
              key={question.questionId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/45 p-3"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Pregunta {question.questionOrder}
                </div>
                <div className="text-sm font-bold">{question.correctAnswer}</div>
              </div>
              {question.isCorrect ? (
                <CheckCircle2 className="size-5 text-primary" />
              ) : (
                <XCircle className="size-5 text-destructive" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Button onClick={onRestart} className="h-12 font-black uppercase tracking-widest">
          Jugar otra vez
        </Button>
        <Button asChild variant="outline" className="neon-border h-12 font-black uppercase">
          <Link to="/games">Volver a juegos</Link>
        </Button>
      </div>
    </section>
  );
}
