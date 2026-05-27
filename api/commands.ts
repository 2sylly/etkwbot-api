import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
  type LeaderboardImageCommandArgs,
  type MapCommandArgs,
  renderLeaderboardImageCommand,
  renderMapCommand,
  renderTerritoryCommand,
} from "../src/commandRenderers.js";
import { requireMethod, sendJson, withApiLogging } from "../src/http.js";

export const config = {
  maxDuration: 60,
};

type CommandRequestBody =
  | ({ type: "map" } & Record<string, unknown>)
  | ({ type: "territory"; territoryName?: unknown } & Record<string, unknown>)
  | ({ type: "leaderboard-image" } & Record<string, unknown>);

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("commands", req, res, async () => {
    if (!requireMethod(req, res, "POST")) {
      return;
    }

    const body = (req.body ?? {}) as CommandRequestBody;

    switch (body.type) {
      case "map": {
        const { type: _type, ...args } = body;
        sendJson(res, 200, {
          ok: true,
          ...(await renderMapCommand(args as MapCommandArgs)),
        });
        return;
      }
      case "territory": {
        const territoryName = typeof body.territoryName === "string"
          ? body.territoryName.trim()
          : "";

        if (!territoryName) {
          sendJson(res, 400, {
            ok: false,
            error: { code: "bad_request", message: "Missing territoryName." },
          });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          ...(await renderTerritoryCommand(territoryName)),
        });
        return;
      }
      case "leaderboard-image": {
        const { type: _type, ...args } = body;
        sendJson(res, 200, {
          ok: true,
          ...(await renderLeaderboardImageCommand(args as LeaderboardImageCommandArgs)),
        });
        return;
      }
      default:
        sendJson(res, 400, {
          ok: false,
          error: {
            code: "bad_request",
            message: "Unknown commands type.",
          },
        });
    }
  });
}
