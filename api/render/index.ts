import type { VercelRequest, VercelResponse } from "@vercel/node";

import { renderLeaderboardCard } from "../../src/leaderboardCard.js";
import { buildPlayerReply, fetchPlayerProfile } from "../../src/player.js";
import { getAttachmentBuffer, sendImage } from "../../src/renderResponse.js";
import {
  renderTerritoryMap,
  renderTerritoryNeighborhoodMap,
  type TerritoryMapSnapshot,
} from "../../src/territoryMap.js";
import type { TerritoryState } from "../../src/territories.js";
import { requireMethod, sendJson, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 30,
};

type RenderRequestBody =
  | {
      type: "player";
      username?: unknown;
      view?: unknown;
      requestedBy?: unknown;
      timeZone?: unknown;
    }
  | ({
      type: "leaderboard-card";
    } & Record<string, unknown>)
  | ({
      type: "territory-map";
    } & Record<string, unknown>)
  | ({
      type: "territory-neighborhood-map";
    } & Record<string, unknown>);

function normalizeDate(value: unknown): Date | undefined {
  return typeof value === "string" || typeof value === "number"
    ? new Date(value)
    : undefined;
}

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
  await withApiLogging("render", req, res, async () => {
    if (!requireMethod(req, res, "POST")) {
      return;
    }

    const body = (req.body ?? {}) as RenderRequestBody & Record<string, unknown>;

    switch (body.type) {
      case "player": {
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const selectedView = typeof body.view === "string" && body.view.trim()
          ? body.view.trim()
          : "main-profile";
        const requestedBy = typeof body.requestedBy === "string" && body.requestedBy.trim()
          ? body.requestedBy.trim()
          : "etkwynn-api";
        const timeZone = typeof body.timeZone === "string" && body.timeZone.trim()
          ? body.timeZone.trim()
          : null;

        if (!username) {
          sendJson(res, 400, {
            ok: false,
            error: { code: "bad_request", message: "Missing username." },
          });
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
        return;
      }
      case "leaderboard-card": {
        const attachment = await renderLeaderboardCard({
          mode: body.mode === "delta" ? "delta" : "current",
          metricLabel: String(body.metricLabel ?? "Guild Raid"),
          rows: Array.isArray(body.rows) ? body.rows as never : [],
          pageIndex: Number(body.pageIndex ?? 0),
          totalPages: Number(body.totalPages ?? 1),
          requestedBy: String(body.requestedBy ?? "etkwynn-api"),
          generatedAt: normalizeDate(body.generatedAt),
          periodLabel: typeof body.periodLabel === "string" ? body.periodLabel : null,
          timeZone: typeof body.timeZone === "string" ? body.timeZone : null,
        });

        sendImage(res, "image/png", "leaderboard-card.png", getAttachmentBuffer(attachment));
        return;
      }
      case "territory-map": {
        const attachment = await renderTerritoryMap(normalizeSnapshot(body.snapshot), {
          cropToTerritories: body.cropToTerritories === true,
          showChrome: body.showChrome === false ? false : undefined,
          cacheKeySuffix: typeof body.cacheKeySuffix === "string" ? body.cacheKeySuffix : undefined,
          guildColors: new Map(Object.entries((body.guildColors ?? {}) as Record<string, string>)),
        });

        sendImage(res, "image/jpeg", "territory-map.jpg", getAttachmentBuffer(attachment));
        return;
      }
      case "territory-neighborhood-map": {
        const snapshot = normalizeSnapshot(body.snapshot);
        const territories = Array.isArray(body.territories)
          ? body.territories as TerritoryState[]
          : snapshot.territories;
        const focusTerritoryName =
          typeof body.focusTerritoryName === "string" ? body.focusTerritoryName : "";

        if (!focusTerritoryName) {
          sendJson(res, 400, {
            ok: false,
            error: { code: "bad_request", message: "Missing focusTerritoryName." },
          });
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
        return;
      }
      default:
        sendJson(res, 400, {
          ok: false,
          error: {
            code: "bad_request",
            message: "Unknown render type.",
          },
        });
    }
  });
}
