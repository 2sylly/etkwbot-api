import type { VercelRequest, VercelResponse } from "@vercel/node";

import commandsLeaderboardImageHandler from "./commands/leaderboard-image.js";
import commandsMapHandler from "./commands/map.js";
import commandsTerritoryHandler from "./commands/territory.js";
import indexHandler from "./index.js";
import playerSummaryHandler from "./player/summary.js";
import renderLeaderboardCardHandler from "./render/leaderboard-card.js";
import renderPlayerHandler from "./render/player.js";
import renderTerritoryMapHandler from "./render/territory-map.js";
import renderTerritoryNeighborhoodMapHandler from "./render/territory-neighborhood-map.js";
import syncGuildRaidsHandler from "./sync/guild-raids.js";
import syncTerritoriesHandler from "./sync/territories.js";
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
    case "commands/map":
      await commandsMapHandler(req, res);
      return;
    case "commands/territory":
      await commandsTerritoryHandler(req, res);
      return;
    case "commands/leaderboard-image":
      await commandsLeaderboardImageHandler(req, res);
      return;
    case "render/player":
      await renderPlayerHandler(req, res);
      return;
    case "render/leaderboard-card":
      await renderLeaderboardCardHandler(req, res);
      return;
    case "render/territory-map":
      await renderTerritoryMapHandler(req, res);
      return;
    case "render/territory-neighborhood-map":
      await renderTerritoryNeighborhoodMapHandler(req, res);
      return;
    case "sync/guild-raids":
      await syncGuildRaidsHandler(req, res);
      return;
    case "sync/territories":
      await syncTerritoriesHandler(req, res);
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
