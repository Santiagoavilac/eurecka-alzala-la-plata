import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";

export interface Column<T> {
  key: keyof T & string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchKeys,
  filters,
  emptyLabel = "Sin resultados",
}: {
  data: T[];
  columns: Column<T>[];
  searchKeys?: (keyof T & string)[];
  filters?: ReactNode;
  emptyLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const filtered = useMemo(() => {
    let rows = data;
    if (q && searchKeys?.length) {
      const term = q.toLowerCase();
      rows = rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(term)));
    }
    if (sort) {
      rows = [...rows].sort((a, b) => {
        const av = a[sort.key]; const bv = b[sort.key];
        if (av == null) return 1; if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
        return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return rows;
  }, [data, q, sort, searchKeys]);

  function toggleSort(key: string) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  return (
    <div className="neon-border overflow-hidden rounded-xl bg-surface">
      <div className="flex flex-col gap-3 border-b border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        {searchKeys && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="h-10 border-border bg-background pl-9"
            />
          </div>
        )}
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn("text-xs uppercase tracking-widest text-muted-foreground", c.className)}>
                  {c.sortable ? (
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">{emptyLabel}</TableCell></TableRow>
            ) : filtered.map((row, i) => (
              <TableRow key={i} className="border-border/40 hover:bg-background/40">
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("font-mono text-sm", c.className)}>
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
        Mostrando {filtered.length} de {data.length}
      </div>
    </div>
  );
}
