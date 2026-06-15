import { createFileRoute } from "@tanstack/react-router";
import { GamesHub } from "@/components/GamesHub";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EUREKA Juegos" },
      {
        name: "description",
        content: "Plataforma de juegos promocionales de EUREKA.",
      },
      { property: "og:title", content: "EUREKA Juegos" },
      { property: "og:description", content: "Jugá dinámicas rápidas y competí por puntajes." },
    ],
  }),
  component: GamesHub,
});
