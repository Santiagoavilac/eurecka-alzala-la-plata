import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { getAdminAuditLogs, type AdminAuditLog } from "@/lib/api";

export const Route = createFileRoute("/admin/sospechosa")({
  component: SospechosaPage,
});

const statusStyle: Record<AdminAuditLog["status"], string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  reviewed: "bg-surface-2 text-foreground border border-border",
  invalidated: "bg-destructive text-destructive-foreground",
};

function SospechosaPage() {
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({ queryKey: ["admin", "auditLogs"], queryFn: getAdminAuditLogs });
  const columns: Column<AdminAuditLog>[] = [
    {
      key: "player",
      header: "Jugador",
      sortable: true,
      render: (r) => <span className="font-sans font-bold">{r.player}</span>,
    },
    { key: "action", header: "Alerta" },
    { key: "ip", header: "IP", className: "text-muted-foreground" },
    {
      key: "userAgent",
      header: "User agent",
      className: "hidden md:table-cell max-w-xs truncate text-muted-foreground",
    },
    {
      key: "date",
      header: "Fecha",
      sortable: true,
      className: "hidden lg:table-cell text-muted-foreground",
    },
    {
      key: "status",
      header: "Estado",
      render: (r) => (
        <Badge className={statusStyle[r.status] + " text-[10px] uppercase tracking-widest"}>
          {r.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">
        Actividad sospechosa
      </h1>
      {isError ? (
        <p className="text-sm text-destructive">No se pudo cargar auditoría.</p>
      ) : isLoading ? (
        <div className="neon-border h-64 animate-pulse rounded-xl bg-surface" />
      ) : (
        <DataTable data={data} columns={columns} searchKeys={["player", "action", "ip"]} />
      )}
    </div>
  );
}
