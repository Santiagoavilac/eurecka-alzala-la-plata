import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EurekaLogo } from "@/components/EurekaLogo";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getLeaderboard } from "@/lib/api";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ranking")({
  head: () => ({ meta: [{ title: "Ranking — Eureka Rocket" }] }),
  component: RankingPage,
});

function RankingPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: getLeaderboard });

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link to="/"><EurekaLogo size="sm" /></Link>
        <Button asChild size="sm" className="font-bold uppercase tracking-widest">
          <Link to="/rocket">Jugar</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-12">
        <h1 className="text-4xl font-black uppercase tracking-tighter sm:text-6xl">
          <span className="text-gradient-primary">Ranking</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Los mejores multiplicadores de Eureka Rocket.</p>

        <div className="mt-6">
          {isLoading ? (
            <div className="neon-border h-64 animate-pulse rounded-xl bg-surface" />
          ) : (
            <LeaderboardTable data={data} />
          )}
        </div>
      </main>
    </div>
  );
}
