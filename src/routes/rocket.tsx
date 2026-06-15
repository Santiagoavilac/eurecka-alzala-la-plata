import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/rocket")({
  beforeLoad: () => {
    throw redirect({ to: "/games" });
  },
});
