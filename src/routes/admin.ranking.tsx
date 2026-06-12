import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getLeaderboard } from "@/lib/api";

export const Route = createFileRoute("/admin/ranking")({
  component: AdminRankingPage,
});

function AdminRankingPage() {
  const { data = [] } = useQuery({ queryKey: ["leaderboard"], queryFn: getLeaderboard });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Ranking</h1>
      <LeaderboardTable data={data} />
    </div>
  );
}
