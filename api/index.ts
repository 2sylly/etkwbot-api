import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireMethod, sendJson, withApiLogging } from "../src/http.js";

const API_DEPLOYMENT_MARKER = "etkwynn-api-2026-05-27-multi-endpoint";
const API_ROUTES = [
  "/api",
  "/api/health",
  "/api/commands",
  "/api/render",
  "/api/sync",
  "/api/territory/names",
  "/api/player/summary?username=<ign>",
] as const;

function getQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  const route = getQueryValue(req.query.route);
  const isHealthRoute = route === "health";

  void withApiLogging(isHealthRoute ? "health" : "index", req, res, () => {
    if (!requireMethod(req, res, "GET")) {
      return;
    }

    if (isHealthRoute) {
      sendJson(res, 200, {
        ok: true,
        service: process.env.API_NAME ?? "etkwynn-api",
        marker: API_DEPLOYMENT_MARKER,
        routes: API_ROUTES,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      name: process.env.API_NAME ?? "etkwynn-api",
      marker: API_DEPLOYMENT_MARKER,
      endpoints: API_ROUTES,
    });
  });
}
