import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireMethod, requireSharedSecret, sendJson, withApiLogging } from "../../src/http.js";
import { syncTerritoriesFromApiRequest } from "../../src/sync.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("sync.territories", req, res, async () => {
    if (!requireMethod(req, res, "POST") || !requireSharedSecret(req, res)) {
      return;
    }

    sendJson(res, 200, await syncTerritoriesFromApiRequest());
  });
}
