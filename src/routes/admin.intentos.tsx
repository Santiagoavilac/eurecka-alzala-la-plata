import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { getAdminAttempts, type AdminAttempt, type AttemptStatus } from "@/lib/api";

export const Route = createFileRoute("/admin/intentos")({
  component: IntentosPage,
});

const statusStyle: Record<AttemptStatus, string> = {
  playing: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  cashed_out: "bg-primary text-primary-foreground",
  crashed: "bg-destructive text-destructive-foreground",
  expired: "bg-surface-2 text-muted-foreground border border-border",
  invalidated: "bg-surface-2 text-muted-foreground border border-border",
};
const labels: Record<AttemptStatus, string> = {
  playing: "Jugando",
  cashed_out: "Retirado",
  crashed: "Explotó",
  expired: "Expirado",
  invalidated: "Inválido",
};

function IntentosPage() {
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({ queryKey: ["admin", "attempts"], queryFn: getAdminAttempts });
  const columns: Column<AdminAttempt>[] = [
    {
      key: "player",
      header: "Jugador",
      sortable: true,
      render: (r) => <span className="font-sans font-bold">{r.player}</span>,
    },
    { key: "attemptNumber", header: "#", sortable: true },
    {
      key: "status",
      header: "Estado",
      render: (r) => (
        <Badge className={statusStyle[r.status] + " text-[10px] uppercase tracking-widest"}>
          {labels[r.status]}
        </Badge>
      ),
    },
    {
      key: "cashoutMultiplier",
      header: "Mult. retiro",
      sortable: true,
      render: (r) =>
        r.cashoutMultiplier != null ? (
          <span className="neon-text font-black">{r.cashoutMultiplier.toFixed(2)}x</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "score",
      header: "Puntaje",
      sortable: true,
      render: (r) => <span className="font-black">{r.score}</span>,
    },
    {
      key: "datetime",
      header: "Fecha",
      sortable: true,
      className: "hidden md:table-cell text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Intentos</h1>
      {isError ? (
        <p className="text-sm text-destructive">No se pudo cargar intentos.</p>
      ) : isLoading ? (
        <div className="neon-border h-64 animate-pulse rounded-xl bg-surface" />
      ) : (
        <DataTable data={data} columns={columns} searchKeys={["player"]} />
      )}
    </div>
  );
}
