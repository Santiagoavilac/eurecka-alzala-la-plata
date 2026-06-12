import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { MOCK_PARTICIPANTS, type AdminParticipant } from "@/lib/api";

export const Route = createFileRoute("/admin/participantes")({
  component: ParticipantesPage,
});

const statusVariant: Record<AdminParticipant["status"], string> = {
  active: "bg-primary text-primary-foreground",
  blocked: "bg-destructive text-destructive-foreground",
  completed: "bg-surface-2 text-foreground border border-border",
};

function ParticipantesPage() {
  const columns: Column<AdminParticipant>[] = [
    { key: "name", header: "Nombre", sortable: true, render: (r) => <span className="font-sans font-bold">{r.name}</span> },
    { key: "phone", header: "Teléfono", className: "text-muted-foreground" },
    { key: "document", header: "Documento", className: "hidden md:table-cell text-muted-foreground" },
    { key: "attemptsUsed", header: "Intentos", sortable: true, render: (r) => <span className="neon-text font-black">{r.attemptsUsed}/3</span> },
    { key: "bestScore", header: "Mejor score", sortable: true, render: (r) => <span className="font-black">{r.bestScore}</span> },
    { key: "status", header: "Estado", render: (r) => (
      <Badge className={statusVariant[r.status] + " uppercase tracking-widest text-[10px]"}>{r.status}</Badge>
    )},
    { key: "registeredAt", header: "Registro", sortable: true, className: "hidden lg:table-cell text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Participantes</h1>
      <DataTable data={MOCK_PARTICIPANTS} columns={columns} searchKeys={["name", "phone", "document"]} />
    </div>
  );
}
