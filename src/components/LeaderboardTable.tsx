import { DataTable, type Column } from "./DataTable";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardEntry } from "@/lib/api";

export function LeaderboardTable({ data }: { data: LeaderboardEntry[] }) {
  const columns: Column<LeaderboardEntry>[] = [
    {
      key: "rank",
      header: "#",
      sortable: true,
      className: "w-14",
      render: (r) => (
        <Badge
          variant="outline"
          className={
            r.rank === 1
              ? "neon-border bg-primary text-primary-foreground"
              : r.rank <= 3
                ? "neon-border bg-background"
                : "border-border bg-background"
          }
        >
          {r.rank}
        </Badge>
      ),
    },
    {
      key: "player",
      header: "Jugador",
      sortable: true,
      render: (r) => <span className="font-sans font-bold">{r.player}</span>,
    },
    {
      key: "phoneMasked",
      header: "Teléfono",
      className: "hidden sm:table-cell text-muted-foreground",
    },
    {
      key: "score",
      header: "Puntaje",
      sortable: true,
      render: (r) => <span className="font-black">{r.score}</span>,
    },
    {
      key: "date",
      header: "Fecha",
      sortable: true,
      className: "hidden md:table-cell text-muted-foreground",
    },
  ];
  return <DataTable data={data} columns={columns} searchKeys={["player"]} />;
}
