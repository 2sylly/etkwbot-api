import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import { logError, logInfo, logWarning } from "./core/logging.js";

export type ApiErrorCode =
  | "method_not_allowed"
  | "not_found"
  | "unauthorized"
  | "internal_error";

export interface ApiErrorBody {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse,
) => Promise<void> | void;

function sanitizeString(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array:${value.length}]`;
    }

    const preview = value.slice(0, 4).map((entry) => summarizeValue(entry, depth + 1));
    return value.length > 4
      ? [...preview, `...(+${value.length - 4} more)`]
      : preview;
  }

  if (typeof value === "object") {
    if (depth >= 2) {
      return "[object]";
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(0, 10);
    const summary: Record<string, unknown> = {};

    for (const [key, entryValue] of entries) {
      if (
        key.toLowerCase().includes("base64") ||
        key.toLowerCase().includes("buffer") ||
        key.toLowerCase().includes("attachment")
      ) {
        summary[key] = "[omitted]";
        continue;
      }

      summary[key] = summarizeValue(entryValue, depth + 1);
    }

    const totalKeys = Object.keys(value as Record<string, unknown>).length;

    if (totalKeys > entries.length) {
      summary.__truncatedKeys = totalKeys - entries.length;
    }

    return summary;
  }

  return String(value);
}

function summarizeRequest(req: VercelRequest): string {
  const parts: string[] = [];

  if (req.query && Object.keys(req.query).length > 0) {
    parts.push(`query=${JSON.stringify(summarizeValue(req.query))}`);
  }

  if (req.body !== undefined) {
    parts.push(`body=${JSON.stringify(summarizeValue(req.body))}`);
  }

  return parts.join(" ");
}

export async function withApiLogging(
  name: string,
  req: VercelRequest,
  res: VercelResponse,
  handler: ApiHandler,
): Promise<void> {
  const startedAt = Date.now();
  const requestSummary = summarizeRequest(req);

  logInfo(
    `[api] ${name} start method=${req.method ?? "UNKNOWN"} url=${req.url ?? ""}${requestSummary ? ` ${requestSummary}` : ""}`,
  );

  try {
    await handler(req, res);

    logInfo(
      `[api] ${name} complete status=${res.statusCode} duration=${Date.now() - startedAt}ms`,
    );
  } catch (error) {
    logError(
      `[api] ${name} failed method=${req.method ?? "UNKNOWN"} url=${req.url ?? ""} duration=${Date.now() - startedAt}ms`,
      error,
    );

    if (!res.headersSent) {
      sendJson<ApiErrorBody>(res, 500, {
        ok: false,
        error: {
          code: "internal_error",
          message: "Internal server error.",
        },
      });
      return;
    }

    try {
      res.end();
    } catch {
      logWarning(`[api] ${name} failed to terminate response after error.`);
    }
  }
}

export function sendJson<T>(
  res: VercelResponse,
  statusCode: number,
  body: T,
): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(statusCode).json(body);
}

export function requireMethod(
  req: VercelRequest,
  res: VercelResponse,
  method: string,
): boolean {
  if (req.method === method) {
    return true;
  }

  logWarning(
    `[api] method_not_allowed expected=${method} actual=${req.method ?? "UNKNOWN"} url=${req.url ?? ""}`,
  );
  res.setHeader("Allow", method);
  sendJson<ApiErrorBody>(res, 405, {
    ok: false,
    error: {
      code: "method_not_allowed",
      message: `Use ${method} for this endpoint.`,
    },
  });
  return false;
}

function getHeaderValue(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function requireSharedSecret(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  const expectedSecret = process.env.ETKWYNN_SYNC_API_SECRET;

  if (!expectedSecret) {
    logWarning("[api] sync secret is not configured.");
    sendJson<ApiErrorBody>(res, 500, {
      ok: false,
      error: {
        code: "internal_error",
        message: "Sync API secret is not configured.",
      },
    });
    return false;
  }

  const providedSecret =
    getHeaderValue(req, "x-etkwynn-sync-secret") ??
    getHeaderValue(req, "authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    logWarning(`[api] unauthorized sync request url=${req.url ?? ""}`);
    sendJson<ApiErrorBody>(res, 401, {
      ok: false,
      error: {
        code: "unauthorized",
        message: "Missing or invalid sync secret.",
      },
    });
    return false;
  }

  return true;
}
