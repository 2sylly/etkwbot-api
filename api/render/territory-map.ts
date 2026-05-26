import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  renderTerritoryMap,
  type TerritoryMapSnapshot,
} from "../../src/territoryMap.js";
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
  await withApiLogging("render.territory-map", req, res, async () => {
    if (!requireMethod(req, res, "POST")) {
      return;
    }

    const body = req.body as Record<string, unknown>;
    const attachment = await renderTerritoryMap(normalizeSnapshot(body.snapshot), {
      cropToTerritories: body.cropToTerritories === true,
      showChrome: body.showChrome === false ? false : undefined,
      cacheKeySuffix: typeof body.cacheKeySuffix === "string" ? body.cacheKeySuffix : undefined,
      guildColors: new Map(Object.entries((body.guildColors ?? {}) as Record<string, string>)),
    });

    sendImage(res, "image/jpeg", "territory-map.jpg", getAttachmentBuffer(attachment));
  });
}
