import type { VercelRequest, VercelResponse } from "@vercel/node";
import indexHandler from "./api/index.js";
import healthHandler from "./api/health.js";
import leaderboardImageHandler from "./api/commands/leaderboard-image.js";
import mapHandler from "./api/commands/map.js";
import territoryCommandHandler from "./api/commands/territory.js";
import playerSummaryHandler from "./api/player/summary.js";
import leaderboardCardHandler from "./api/render/leaderboard-card.js";
import playerRenderHandler from "./api/render/player.js";
import territoryMapHandler from "./api/render/territory-map.js";
import territoryNeighborhoodMapHandler from "./api/render/territory-neighborhood-map.js";
import guildRaidsSyncHandler from "./api/sync/guild-raids.js";
import territoriesSyncHandler from "./api/sync/territories.js";
import territoryNamesHandler from "./api/territory/names.js";

type RouteHandler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;

const routeHandlers = new Map<string, RouteHandler>([
  ["/", indexHandler],
  ["/api", indexHandler],
  ["/api/health", healthHandler],
  ["/api/player/summary", playerSummaryHandler],
  ["/api/territory/names", territoryNamesHandler],
  ["/api/commands/map", mapHandler],
  ["/api/commands/territory", territoryCommandHandler],
  ["/api/commands/leaderboard-image", leaderboardImageHandler],
  ["/api/render/player", playerRenderHandler],
  ["/api/render/leaderboard-card", leaderboardCardHandler],
  ["/api/render/territory-map", territoryMapHandler],
  ["/api/render/territory-neighborhood-map", territoryNeighborhoodMapHandler],
  ["/api/sync/guild-raids", guildRaidsSyncHandler],
  ["/api/sync/territories", territoriesSyncHandler],
]);

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const pathname = normalizePathname(new URL(req.url ?? "/", "http://localhost").pathname);
  const routeHandler = routeHandlers.get(pathname);

  if (!routeHandler) {
    res.status(404).json({
      ok: false,
      error: "Not Found",
      pathname,
    });
    return;
  }

  await routeHandler(req, res);
}
