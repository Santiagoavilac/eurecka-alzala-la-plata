import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { MOCK_ATTEMPTS, type AdminAttempt, type AttemptStatus } from "@/lib/api";

export const Route = createFileRoute("/admin/intentos")({
  component: IntentosPage,
});

const statusStyle: Record<AttemptStatus, string> = {
  playing: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  cashed_out: "bg-primary text-primary-foreground",
  exploded: "bg-destructive text-destructive-foreground",
  invalid: "bg-surface-2 text-muted-foreground border border-border",
};
const labels: Record<AttemptStatus, string> = {
  playing: "Jugando", cashed_out: "Retirado", exploded: "Explotó", invalid: "Inválido",
};

function IntentosPage() {
  const columns: Column<AdminAttempt>[] = [
    { key: "player", header: "Jugador", sortable: true, render: (r) => <span className="font-sans font-bold">{r.player}</span> },
    { key: "attemptNumber", header: "#", sortable: true },
    { key: "status", header: "Estado", render: (r) => (
      <Badge className={statusStyle[r.status] + " text-[10px] uppercase tracking-widest"}>{labels[r.status]}</Badge>
    )},
    { key: "cashoutMultiplier", header: "Mult. retiro", sortable: true,
      render: (r) => r.cashoutMultiplier != null
        ? <span className="neon-text font-black">{r.cashoutMultiplier.toFixed(2)}x</span>
        : <span className="text-muted-foreground">—</span> },
    { key: "score", header: "Puntaje", sortable: true, render: (r) => <span className="font-black">{r.score}</span> },
    { key: "datetime", header: "Fecha", sortable: true, className: "hidden md:table-cell text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Intentos</h1>
      <DataTable data={MOCK_ATTEMPTS} columns={columns} searchKeys={["player"]} />
    </div>
  );
}
