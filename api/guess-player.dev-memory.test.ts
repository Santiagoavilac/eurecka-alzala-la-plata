import assert from "node:assert/strict";
import test from "node:test";

import { createDevMemoryApp } from "./dev-memory-server";

function registeredRoutes() {
  const app = createDevMemoryApp() as unknown as {
    router?: { stack?: { route?: { path: string; methods: Record<string, boolean> } }[] };
  };
  return (app.router?.stack ?? [])
    .map((layer) => layer.route)
    .filter((route): route is { path: string; methods: Record<string, boolean> } => Boolean(route))
    .map((route) => ({
      path: route.path,
      methods: Object.keys(route.methods).sort(),
    }));
}

test("dev memory registers guess player endpoints for local development", () => {
  assert.deepEqual(
    registeredRoutes().filter((route) => route.path.startsWith("/api/guess-player")),
    [
      { path: "/api/guess-player/start", methods: ["post"] },
      { path: "/api/guess-player/session/:sessionId/current", methods: ["get"] },
      { path: "/api/guess-player/answer", methods: ["post"] },
      { path: "/api/guess-player/session/:sessionId/result", methods: ["get"] },
    ],
  );
});
