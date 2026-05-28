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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("health", req, res, async () => {
    const method = req.method?.toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      sendJson(res, 405, {
        error: "Method Not Allowed",
      });
      return;
    }

    if (method === "HEAD") {
      res.status(200).end();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      service: process.env.API_NAME ?? "etkwynn-api",
      marker: API_DEPLOYMENT_MARKER,
      routes: API_ROUTES,
      timestamp: new Date().toISOString(),
    });
  });
}