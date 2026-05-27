import type { VercelRequest, VercelResponse } from "@vercel/node";

import commandsHandler from "./commands.js";
import indexHandler from "./index.js";
import playerSummaryHandler from "./player/summary.js";
import renderHandler from "./render.js";
import syncHandler from "./sync.js";
import territoryNamesHandler from "./territory/names.js";
import { sendJson } from "../src/http.js";

function normalizeRouteParts(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((part) => part.split("/")).filter((part) => part.length > 0);
  }

  if (typeof value === "string") {
    return value.split("/").filter((part) => part.length > 0);
  }

  return [];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const routeParts = normalizeRouteParts(req.query.route);
  const routeKey = routeParts.join("/");

  switch (routeKey) {
    case "":
      indexHandler(req, res);
      return;
    case "health":
      req.query = { ...req.query, route: "health" };
      indexHandler(req, res);
      return;
    case "commands":
      await commandsHandler(req, res);
      return;
    case "render":
      await renderHandler(req, res);
      return;
    case "sync":
      await syncHandler(req, res);
      return;
    case "territory/names":
      await territoryNamesHandler(req, res);
      return;
    case "player/summary":
      await playerSummaryHandler(req, res);
      return;
    default:
      sendJson(res, 404, {
        ok: false,
        error: `Unknown API route: /api/${routeKey}`,
      });
  }
}
