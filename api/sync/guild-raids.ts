import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireMethod, requireSharedSecret, sendJson, withApiLogging } from "../../src/http.js";
import { syncGuildRaidsFromApiRequest } from "../../src/sync.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("sync.guild-raids", req, res, async () => {
    if (!requireMethod(req, res, "POST") || !requireSharedSecret(req, res)) {
      return;
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason : "api";
    sendJson(res, 200, await syncGuildRaidsFromApiRequest(reason));
  });
}
