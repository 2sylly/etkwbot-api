import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  renderTerritoryNeighborhoodMap,
  type TerritoryMapSnapshot,
} from "../../src/territoryMap.js";
import type { TerritoryState } from "../../src/territories.js";
import { getAttachmentBuffer, sendImage } from "../../src/renderResponse.js";
import { requireMethod, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 30,
};

function normalizeSnapshot(value: unknown): TerritoryMapSnapshot {
  const snapshot = value as TerritoryMapSnapshot;

  return {
    ...snapshot,
    takenAt: new Date(snapshot.takenAt),
    territoryLastTick: snapshot.territoryLastTick
      ? new Date(snapshot.territoryLastTick)
      : null,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await withApiLogging("render.territory-neighborhood-map", req, res, async () => {
    if (!requireMethod(req, res, "POST")) {
      return;
    }

    const body = req.body as Record<string, unknown>;
    const snapshot = normalizeSnapshot(body.snapshot);
    const territories = Array.isArray(body.territories)
      ? body.territories as TerritoryState[]
      : snapshot.territories;
    const focusTerritoryName =
      typeof body.focusTerritoryName === "string" ? body.focusTerritoryName : "";

    if (!focusTerritoryName) {
      res.status(400).json({ ok: false, error: { code: "bad_request", message: "Missing focusTerritoryName." } });
      return;
    }

    const attachment = await renderTerritoryNeighborhoodMap(
      snapshot,
      territories,
      focusTerritoryName,
      {
        guildColors: new Map(Object.entries((body.guildColors ?? {}) as Record<string, string>)),
      },
    );

    sendImage(res, "image/jpeg", "territory-focus.jpg", getAttachmentBuffer(attachment));
  });
}
