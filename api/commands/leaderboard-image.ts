import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderLeaderboardImageCommand } from "../../src/commandRenderers.js";
import { requireMethod, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("commands.leaderboard-image", req, res, async () => {
    if (!requireMethod(req, res, "POST")) {
      return;
    }

    res.status(200).json({
      ok: true,
      ...(await renderLeaderboardImageCommand(req.body)),
    });
  });
}
