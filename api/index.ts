import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireMethod, sendJson, withApiLogging } from "../src/http.js";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  void withApiLogging("index", req, res, () => {
    if (!requireMethod(req, res, "GET")) {
      return;
    }

    sendJson(res, 200, {
      ok: true,
      name: process.env.API_NAME ?? "etkwynn-api",
      endpoints: ["/api/health"],
    });
  });
}
