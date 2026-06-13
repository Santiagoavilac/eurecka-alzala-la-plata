import { existsSync, readFileSync } from "node:fs";

const configPath = ".vercel/output/config.json";
const serverPath = ".vercel/output/functions/__server.func/index.mjs";

if (!existsSync(configPath) || !existsSync(serverPath)) {
  console.error(
    "Vercel SSR output was not generated. Expected .vercel/output with __server function.",
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const hasServerRewrite = config.routes?.some(
  (route) => route?.src === "/(.*)" && route?.dest === "/__server",
);

if (!hasServerRewrite) {
  console.error("Vercel output is missing catch-all rewrite to /__server.");
  process.exit(1);
}

console.log("Verified Vercel SSR output.");
