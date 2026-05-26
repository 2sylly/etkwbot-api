import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildPlayerViewSummary, fetchPlayerProfile } from "../../src/player.js";
import { requireMethod, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 30,
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await withApiLogging("player.summary", req, res, async () => {
    if (!requireMethod(req, res, "GET")) {
      return;
    }

    const username = typeof req.query.username === "string" ? req.query.username.trim() : "";

    if (!username) {
      res.status(400).json({
        ok: false,
        error: {
          code: "bad_request",
          message: "Missing username.",
        },
      });
      return;
    }

    const profile = await fetchPlayerProfile(username);
    res.status(200).json({
      ok: true,
      player: buildPlayerViewSummary(profile),
    });
  });
}
