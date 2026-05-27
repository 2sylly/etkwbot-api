import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function buildFontCandidates(fontPath: string): string[] {
  const directory = dirname(fontPath);
  const filename = basename(fontPath);
  const stem = filename.replace(/(?:\.ttf|\.otf(?:\.woff2)?|\.woff2)$/i, "");

  return [
    join(directory, `${stem}.ttf`),
    join(directory, `${stem}.otf`),
    join(directory, `${stem}.otf.woff2`)
  ];
}

export function resolvePreferredFontPath(fontPath: string): string {
  return buildFontCandidates(fontPath).find((candidate) => existsSync(candidate)) ?? fontPath;
}

export function resolvePreferredFontPathFromUrl(fontUrl: URL): string {
  return resolvePreferredFontPath(fileURLToPath(fontUrl));
}
