import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EurekaLogo } from "@/components/EurekaLogo";
import { apiErrorMessage, loginPlayer } from "@/lib/api";
import { markGameMusicRequested, playGameMusic, stopGameMusic } from "@/lib/game-audio";

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({ meta: [{ title: "Crear mi pase — EUREKA Juegos" }] }),
  component: EntrarPage,
});

function EntrarPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [form, setForm] = useState({ name: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const shouldEnterGuessPlayer = next === "/games/adivina-el-jugador";
    if (shouldEnterGuessPlayer) {
      markGameMusicRequested();
      void playGameMusic();
    }
    try {
      await loginPlayer({
        fullName: form.name,
        phone: form.phone,
      });
      navigate({ to: shouldEnterGuessPlayer ? next : "/games" });
    } catch (error) {
      if (shouldEnterGuessPlayer) {
        stopGameMusic();
      }
      setError(`Error exacto: ${apiErrorMessage(error, "login_failed")}`);
    } finally {
      setLoading(false);
    }
  }

  const valid = form.name.trim() && form.phone.trim();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 py-5">
        <Link to="/">
          <EurekaLogo size="sm" />
        </Link>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16">
        <h1 className="text-4xl font-black uppercase tracking-tighter sm:text-5xl">
          Creá tu <span className="text-gradient-primary">pase</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Usaremos estos datos para identificar tu pase en los juegos de EUREKA.
        </p>

        <form onSubmit={onSubmit} className="neon-border mt-8 space-y-5 rounded-2xl bg-surface p-6">
          <Field
            id="name"
            label="Nombre completo"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Juan Pérez"
          />
          <Field
            id="phone"
            label="Teléfono"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            placeholder="+595 9XX XXX XXX"
            type="tel"
          />
          <Button
            type="submit"
            size="lg"
            disabled={!valid || loading}
            className="h-14 w-full text-base font-black uppercase tracking-widest"
          >
            {loading ? "Creando…" : "Crear mi pase"}
          </Button>

          {error && <p className="text-center text-xs font-bold text-destructive">{error}</p>}

          <p className="text-center text-[11px] uppercase tracking-widest text-muted-foreground">
            Sin contraseña · Nombre y teléfono
          </p>
        </form>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 border-border bg-background text-base"
      />
    </div>
  );
}
