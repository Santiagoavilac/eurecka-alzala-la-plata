import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getAdminLeaderboard } from "@/lib/api";

export const Route = createFileRoute("/admin/ranking")({
  component: AdminRankingPage,
});

function AdminRankingPage() {
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({ queryKey: ["admin", "leaderboard"], queryFn: getAdminLeaderboard });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Ranking</h1>
      {isError ? (
        <p className="text-sm text-destructive">No se pudo cargar ranking.</p>
      ) : isLoading ? (
        <div className="neon-border h-64 animate-pulse rounded-xl bg-surface" />
      ) : (
        <LeaderboardTable data={data} />
      )}
    </div>
  );
}
