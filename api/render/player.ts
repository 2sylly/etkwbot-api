import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildPlayerReply, fetchPlayerProfile } from "../../src/player.js";
import { getAttachmentBuffer, sendImage } from "../../src/renderResponse.js";
import { requireMethod, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 30,
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await withApiLogging("render.player", req, res, async () => {
    if (!requireMethod(req, res, "GET")) {
      return;
    }

    const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
    const selectedView = typeof req.query.view === "string" && req.query.view.trim()
      ? req.query.view.trim()
      : "main-profile";
    const requestedBy = typeof req.query.requestedBy === "string" && req.query.requestedBy.trim()
      ? req.query.requestedBy.trim()
      : "etkwynn-api";
    const timeZone = typeof req.query.timeZone === "string" && req.query.timeZone.trim()
      ? req.query.timeZone.trim()
      : null;

    if (!username) {
      res.status(400).json({ ok: false, error: { code: "bad_request", message: "Missing username." } });
      return;
    }

    const profile = await fetchPlayerProfile(username);
    const reply = await buildPlayerReply(
      profile,
      requestedBy,
      "api:player-view",
      selectedView,
      false,
      timeZone,
    );
    const attachment = reply.files[0];

    if (!attachment) {
      throw new Error("Player renderer did not return an attachment.");
    }

    sendImage(res, "image/png", "player-card.png", getAttachmentBuffer(attachment));
  });
}
