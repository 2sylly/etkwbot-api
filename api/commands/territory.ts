import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderTerritoryCommand } from "../../src/commandRenderers.js";
import { requireMethod, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await withApiLogging("commands.territory", req, res, async () => {
    if (!requireMethod(req, res, "POST")) {
      return;
    }

    const territoryName = typeof req.body?.territoryName === "string"
      ? req.body.territoryName.trim()
      : "";

    if (!territoryName) {
      res.status(400).json({ ok: false, error: { code: "bad_request", message: "Missing territoryName." } });
      return;
    }

    res.status(200).json({
      ok: true,
      ...(await renderTerritoryCommand(territoryName)),
    });
  });
}
