export const WYNNTILS_GUILD_COLOR_BY_PREFIX: Readonly<Record<string, string>> = {
  Aeq: "#ffd700",
  ANO: "#ffffff",
  AVO: "#1010FE",
  Bav: "#2fffff",
  CZD: "#da4040",
  ESI: "#82bc85",
  Focs: "#c15d5d",
  LEAF: "#087209",
  Nia: "#ff007f",
  OxOO: "#d24a4a",
  PLHR: "#6a6a6a",
  PUN: "#c7b3f0",
  PXM: "#c266ff",
  RARO: "#d94141",
  SEQ: "#3a2651",
  TBUH: "#d66d04",
  wpq: "#b367ef"
};

export function getBundledWynntilsGuildColor(prefix: string): string | null {
  return WYNNTILS_GUILD_COLOR_BY_PREFIX[prefix] ?? null;
}

export function buildBundledWynntilsGuildColorMap(
  prefixes: Iterable<string>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const prefix of prefixes) {
    const color = getBundledWynntilsGuildColor(prefix);

    if (color) {
      map.set(prefix, color);
    }
  }

  return map;
}
