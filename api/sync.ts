import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
  requireMethod,
  requireSharedSecret,
  sendJson,
  withApiLogging,
} from "../src/http.js";
import {
  syncGuildRaidsFromApiRequest,
  syncTerritoriesFromApiRequest,
} from "../src/sync.js";

export const config = {
  maxDuration: 60,
};

type SyncRequestBody =
  | { type: "guild-raids"; reason?: unknown }
  | { type: "territories" };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("sync", req, res, async () => {
    if (!requireMethod(req, res, "POST") || !requireSharedSecret(req, res)) {
      return;
    }

    const body = (req.body ?? {}) as SyncRequestBody;

    switch (body.type) {
      case "guild-raids": {
        const reason = typeof body.reason === "string" ? body.reason : "api";
        sendJson(res, 200, await syncGuildRaidsFromApiRequest(reason));
        return;
      }
      case "territories":
        sendJson(res, 200, await syncTerritoriesFromApiRequest());
        return;
      default:
        sendJson(res, 400, {
          ok: false,
          error: {
            code: "bad_request",
            message: "Unknown sync type.",
          },
        });
    }
  });
}
