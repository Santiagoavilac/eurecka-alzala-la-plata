import { Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { EurekaLogo } from "../EurekaLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminLogin } from "@/lib/api";

const NAV = [
  { to: "/admin/participantes", label: "Participantes" },
  { to: "/admin/intentos", label: "Intentos" },
  { to: "/admin/ranking", label: "Ranking" },
  { to: "/admin/sospechosa", label: "Sospechosa" },
] as const;

export function AdminLayout() {
  const [pin, setPin] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adminLogin(pin);
      setAuthenticated(true);
    } catch {
      setError("PIN inválido o sesión no disponible.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <EurekaLogo size="sm" />
            </Link>
            <Badge variant="outline" className="neon-border uppercase tracking-widest">
              Admin
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">Protegido por PIN</span>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-3 py-2 text-sm font-bold uppercase tracking-widest text-muted-foreground transition hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
              activeProps={{ "data-status": "active" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {authenticated ? (
          <Outlet />
        ) : (
          <form
            onSubmit={onSubmit}
            className="neon-border mx-auto mt-10 max-w-sm space-y-4 rounded-xl bg-surface p-5"
          >
            <h1 className="text-xl font-black uppercase tracking-tighter">Acceso admin</h1>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              type="password"
              placeholder="ADMIN_PIN"
              className="h-12 border-border bg-background"
            />
            <Button type="submit" className="h-12 w-full font-black uppercase tracking-widest">
              Entrar
            </Button>
            {error && <p className="text-center text-xs font-bold text-destructive">{error}</p>}
          </form>
        )}
      </main>
    </div>
  );
}
