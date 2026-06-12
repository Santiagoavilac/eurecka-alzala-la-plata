import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { MOCK_SUSPICIOUS, type AdminSuspicious } from "@/lib/api";

export const Route = createFileRoute("/admin/sospechosa")({
  component: SospechosaPage,
});

const statusStyle: Record<AdminSuspicious["status"], string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  reviewed: "bg-surface-2 text-foreground border border-border",
  invalidated: "bg-destructive text-destructive-foreground",
};

function SospechosaPage() {
  const columns: Column<AdminSuspicious>[] = [
    { key: "player", header: "Jugador", sortable: true, render: (r) => <span className="font-sans font-bold">{r.player}</span> },
    { key: "alertType", header: "Alerta" },
    { key: "ip", header: "IP", className: "text-muted-foreground" },
    { key: "userAgent", header: "User agent", className: "hidden md:table-cell max-w-xs truncate text-muted-foreground" },
    { key: "date", header: "Fecha", sortable: true, className: "hidden lg:table-cell text-muted-foreground" },
    { key: "status", header: "Estado", render: (r) => (
      <Badge className={statusStyle[r.status] + " text-[10px] uppercase tracking-widest"}>{r.status}</Badge>
    )},
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Actividad sospechosa</h1>
      <DataTable data={MOCK_SUSPICIOUS} columns={columns} searchKeys={["player", "alertType", "ip"]} />
    </div>
  );
}
