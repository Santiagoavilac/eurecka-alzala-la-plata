import { createFileRoute } from "@tanstack/react-router";
import { GamesHub } from "@/components/GamesHub";

export const Route = createFileRoute("/games/")({
  head: () => ({ meta: [{ title: "Juegos — EUREKA" }] }),
  component: GamesHub,
});
