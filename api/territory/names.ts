import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchTerritoryNamesCommand } from "../../src/commandRenderers.js";
import { requireMethod, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 30,
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("territory.names", req, res, async () => {
    if (!requireMethod(req, res, "GET")) {
      return;
    }

    res.status(200).json({
      ok: true,
      names: await fetchTerritoryNamesCommand(),
    });
  });
}
