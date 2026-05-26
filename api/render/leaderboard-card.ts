import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderLeaderboardCard } from "../../src/leaderboardCard.js";
import { getAttachmentBuffer, sendImage } from "../../src/renderResponse.js";
import { requireMethod, withApiLogging } from "../../src/http.js";

export const config = {
  maxDuration: 30,
};

function normalizeDate(value: unknown): Date | undefined {
  return typeof value === "string" || typeof value === "number"
    ? new Date(value)
    : undefined;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await withApiLogging("render.leaderboard-card", req, res, async () => {
    if (!requireMethod(req, res, "POST")) {
      return;
    }

    const body = req.body as Record<string, unknown>;
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
  });
}
