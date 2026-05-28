import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AttachmentBuilder } from "discord.js";
import sharp from "sharp";
import { measureCanvasTextWidth, renderCanvasText } from "./canvasText.js";
import { resolvePreferredFontPath } from "./fontPath.js";
import { fetchWithWynncraftAuthFallback } from "./wynncraft.js";

type HorizontalAnchor = "left" | "center" | "right";
type VerticalAnchor = "top" | "middle" | "bottom";
type SpriteSheetId = "icons" | "weps" | "armor";

type RectLayer = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity?: number;
};

type TextLayer = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  opacity?: number;
  anchor?: HorizontalAnchor;
  verticalAlign?: VerticalAnchor;
  stroke?: string;
  strokeWidth?: number;
};

type LootpoolReward = {
  name: string;
  type: string;
  amount: number;
  tier?: string;
  shiny?: boolean;
};

type LootpoolCamp = {
  name: string;
  internalName: string;
  type: string;
  rewards: LootpoolReward[];
};

type LootpoolTier = "FABLED" | "LEGENDARY" | "RARE" | "UNIQUE";

type LootpoolCampSummary = {
  shinyReward: LootpoolReward | null;
  eligibleRewards: LootpoolReward[];
  rewardsByTier: Record<LootpoolTier, LootpoolReward[]>;
  liquidEmeraldAmount: number;
  emeraldBlockAmount: number;
  runeAmounts: {
    Nii: number;
    Uth: number;
    Tol: number;
  };
};

type SpriteDescriptor = {
  sheet: SpriteSheetId;
  x: number;
  y: number;
  iconSheetVariant?: "default" | "sheet2";
};

type ColoredToken = {
  text: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
};

type ColoredLine = {
  tokens: ColoredToken[];
};

export type LootpoolView = "camp" | "global";

export type RenderLootpoolArgs = {
  view: LootpoolView;
  campInternalName?: string | null;
  requestedBy: string;
  generatedAt?: Date;
  timeZone?: string | null;
};

export type LootpoolMetadata = {
  defaultCampInternalName: string;
  camps: Array<{
    name: string;
    internalName: string;
  }>;
};

const configPath = new URL("../player-playground.config.json", import.meta.url);
const configDirectory = dirname(fileURLToPath(configPath));
const rawConfig = JSON.parse(readFileSync(configPath, "utf8")) as {
  font: {
    path: string;
    family?: string;
  };
};
const backgroundPath = new URL("../public/img/raid-lr.png", import.meta.url);
const iconSheetPath = new URL("../public/img/WynnIconCSS.png", import.meta.url);
const iconSheetTwoPath = new URL("../public/img/WynnIcon2CSS.png", import.meta.url);
const weaponSheetPath = new URL("../public/img/WeaponSprites.png", import.meta.url);
const armorSheetPath = new URL("../public/img/ArmourSprites.png", import.meta.url);
const backgroundBuffer = readFileSync(backgroundPath);
const iconSheetBuffer = readFileSync(iconSheetPath);
const iconSheetTwoBuffer = readFileSync(iconSheetTwoPath);
const weaponSheetBuffer = readFileSync(weaponSheetPath);
const armorSheetBuffer = readFileSync(armorSheetPath);
const fontPath = resolvePreferredFontPath(resolve(configDirectory, rawConfig.font.path));
const fontFamily = rawConfig.font.family ?? "Mojangles";
const imageWidth = 2128;
const imageHeight = 1500;
const backgroundFit: keyof sharp.FitEnum = "cover";
const letterSpacing = -3;
const textColor = "#071018";
const mythicTextColor = "#A0A";
const tierColors: Record<LootpoolTier, string> = {
  FABLED: "#F55",
  LEGENDARY: "#5FF",
  RARE: "#F5F",
  UNIQUE: "#FF5",
};
const wardColors: Record<string, string> = {
  "Blue Ward": "#55F",
  "Green Ward": "#5F5",
  "Orange Ward": "#fc9e56",
  "Pink Ward": "#e83cfb",
  "Purple Ward": "#F5F",
  "Red Ward": "#F55",
  "Yellow Ward": "#FF5",
};
const lootpoolUrl = "https://api.wynncraft.com/v3/map/camps";
const lootpoolCacheTtlMs = 60_000;

let cachedLootpoolCamps:
  | {
      expiresAt: number;
      camps: LootpoolCamp[];
    }
  | null = null;
let lootpoolFetchPromise: Promise<LootpoolCamp[]> | null = null;
const textWidthCache = new Map<string, number>();
const spriteBufferCache = new Map<string, Promise<Buffer>>();

const spriteDescriptors = new Map<string, SpriteDescriptor>();

function registerSprite(
  name: string,
  sheet: SpriteSheetId,
  x: number,
  y: number,
  iconSheetVariant: "default" | "sheet2" = "default",
): void {
  spriteDescriptors.set(name.toLowerCase(), { sheet, x, y, iconSheetVariant });
}

registerSprite("Shiny", "icons", 0, 8, "sheet2");
registerSprite("Corkian Insulator", "icons", 12, 7);
registerSprite("Corkian Simulator", "icons", 13, 7);
registerSprite("Insulator", "icons", 12, 7);
registerSprite("Simulator", "icons", 13, 7);
registerSprite("Blue Ward", "icons", 13, 13, "sheet2");
registerSprite("Green Ward", "icons", 15, 13, "sheet2");
registerSprite("Orange Ward", "icons", 0, 14, "sheet2");
registerSprite("Pink Ward", "icons", 1, 14, "sheet2");
registerSprite("Purple Ward", "icons", 2, 14, "sheet2");
registerSprite("Red Ward", "icons", 3, 14, "sheet2");
registerSprite("Yellow Ward", "icons", 5, 14, "sheet2");
registerSprite("Liquid Emerald", "icons", 19, 0);
registerSprite("Liquified Emerald", "icons", 19, 0);
registerSprite("Emerald Block", "icons", 18, 0);
registerSprite("Nii Rune", "icons", 7, 19);
registerSprite("Uth Rune", "icons", 6, 19);
registerSprite("Tol Rune", "icons", 4, 19);

registerSprite("Apocalypse", "weps", 2, 5);
registerSprite("Hero", "weps", 5, 5);
registerSprite("Guardian", "weps", 2, 5);
registerSprite("Alkatraz", "weps", 0, 4);
registerSprite("Idol", "weps", 8, 4);
registerSprite("Thrundacrack", "weps", 5, 4);
registerSprite("Collapse", "weps", 8, 5);
registerSprite("Bloodbath", "weps", 2, 4);
registerSprite("Convergence", "weps", 8, 5);
registerSprite("Ascendancy", "weps", 2, 5);
registerSprite("Restitution", "weps", 5, 4);
registerSprite("Az", "weps", 5, 2);
registerSprite("Freedom", "weps", 8, 3);
registerSprite("Grandmother", "weps", 2, 2);
registerSprite("Ignis", "weps", 2, 3);
registerSprite("Divzer", "weps", 5, 2);
registerSprite("Spring", "weps", 8, 2);
registerSprite("Stratiformis", "weps", 5, 3);
registerSprite("Epoch", "weps", 9, 3);
registerSprite("Labyrinth", "weps", 2, 2);
registerSprite("Revolution", "weps", 5, 3);
registerSprite("Eschaton", "weps", 2, 3);
registerSprite("Pure", "weps", 6, 1);
registerSprite("Lament", "weps", 8, 0);
registerSprite("Gaia", "weps", 2, 0);
registerSprite("Monster", "weps", 2, 1);
registerSprite("Fatal", "weps", 5, 0);
registerSprite("Singularity", "weps", 8, 1);
registerSprite("Warp", "weps", 5, 1);
registerSprite("Quetzalcoatl", "weps", 5, 1);
registerSprite("Trance", "weps", 2, 1);
registerSprite("Riptide", "weps", 8, 0);
registerSprite("Halcyon", "weps", 8, 1);
registerSprite("Archangel", "weps", 5, 5);
registerSprite("Nullification", "weps", 9, 7);
registerSprite("Cataclysm", "weps", 5, 6);
registerSprite("Grimtrap", "weps", 2, 6);
registerSprite("Weathered", "weps", 5, 7);
registerSprite("Inferno", "weps", 2, 7);
registerSprite("Nirvana", "weps", 8, 6);
registerSprite("Oblivion", "weps", 8, 7);
registerSprite("Hanafubuki", "weps", 5, 7);
registerSprite("Architect", "weps", 2, 6);
registerSprite("Vengeance", "weps", 5, 6);
registerSprite("Aftershock", "weps", 2, 8);
registerSprite("Olympic", "weps", 5, 9);
registerSprite("Hadal", "weps", 8, 8);
registerSprite("Sunstar", "weps", 5, 8);
registerSprite("Fantasia", "weps", 8, 9);
registerSprite("Toxoplasmosis", "weps", 2, 8);
registerSprite("Absolution", "weps", 2, 9);
registerSprite("Immolation", "weps", 2, 9);
registerSprite("Resonance", "weps", 9, 9);
registerSprite("Fate", "weps", 2, 8);
registerSprite("Transfiguration", "weps", 5, 9);

registerSprite("Discoverer", "armor", 1, 3);
registerSprite("Crusade Sabatons", "armor", 3, 3);
registerSprite("Resurgence", "armor", 3, 3);
registerSprite("Galleon", "armor", 3, 3);
registerSprite("Boreal", "armor", 3, 3);
registerSprite("Slayer", "armor", 3, 3);
registerSprite("Moontower", "armor", 3, 3);
registerSprite("Dawnbreak", "armor", 3, 3);
registerSprite("Stardew", "armor", 3, 3);
registerSprite("Warchief", "armor", 3, 3);
registerSprite("Revenant", "armor", 3, 3);

function stripFormattingCodes(value: string): string {
  return value.replace(/\u00a7./g, "").trim();
}

function getDisplayRewardName(name: string): string {
  const stripped = stripFormattingCodes(name);
  const lower = stripped.toLowerCase();

  if (lower === "liquified emerald") {
    return "Liquid Emerald";
  }

  if (lower === "corkian insulator") {
    return "Insulator";
  }

  if (lower === "corkian simulator") {
    return "Simulator";
  }

  return stripped;
}

function getRewardKey(name: string): string {
  return getDisplayRewardName(name).toLowerCase();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatOpacity(opacity: number | undefined): string {
  if (typeof opacity !== "number") {
    return "1";
  }

  return `${Math.max(0, Math.min(1, opacity))}`;
}

function buildShapeOverlaySvg(width: number, height: number, layers: RectLayer[]): Buffer {
  const rects = layers.map(
    (layer) =>
      `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" fill="${escapeXml(layer.fill)}" opacity="${formatOpacity(layer.opacity)}" />`,
  );

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${rects.join("\n  ")}
</svg>`);
}

function getTextLeft(layer: TextLayer, width: number): number {
  switch (layer.anchor) {
    case "center":
      return Math.round(layer.x - width / 2);
    case "right":
      return Math.round(layer.x - width);
    default:
      return Math.round(layer.x);
  }
}

function getTextTop(layer: TextLayer, height: number): number {
  switch (layer.verticalAlign) {
    case "middle":
      return Math.round(layer.y - height / 2);
    case "bottom":
      return Math.round(layer.y - height);
    default:
      return Math.round(layer.y);
  }
}

async function buildTextOverlay(layer: TextLayer): Promise<sharp.OverlayOptions | null> {
  if (!layer.text.trim()) {
    return null;
  }

  const rendered = await renderCanvasText({
    text: layer.text,
    fontPath,
    fontFamily,
    fontSize: layer.fontSize,
    fill: layer.fill,
    opacity: layer.opacity,
    letterSpacing,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
  });

  return {
    input: rendered.buffer,
    left: getTextLeft(layer, rendered.width) - rendered.offsetX,
    top: getTextTop(layer, rendered.height) - rendered.offsetY,
  };
}

async function normalizeOverlay(
  overlay: sharp.OverlayOptions | null,
  canvasWidth: number,
  canvasHeight: number,
): Promise<sharp.OverlayOptions | null> {
  if (!overlay) {
    return null;
  }

  if (!Buffer.isBuffer(overlay.input)) {
    return overlay;
  }

  const metadata = await sharp(overlay.input).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const rawLeft = Math.round(overlay.left ?? 0);
  const rawTop = Math.round(overlay.top ?? 0);
  const visibleLeft = Math.max(0, rawLeft);
  const visibleTop = Math.max(0, rawTop);
  const extractLeft = Math.max(0, -rawLeft);
  const extractTop = Math.max(0, -rawTop);
  const visibleWidth = Math.min(sourceWidth - extractLeft, canvasWidth - visibleLeft);
  const visibleHeight = Math.min(sourceHeight - extractTop, canvasHeight - visibleTop);

  if (visibleWidth <= 0 || visibleHeight <= 0) {
    return null;
  }

  const input =
    extractLeft > 0 ||
    extractTop > 0 ||
    visibleWidth !== sourceWidth ||
    visibleHeight !== sourceHeight
      ? await sharp(overlay.input)
          .extract({
            left: extractLeft,
            top: extractTop,
            width: visibleWidth,
            height: visibleHeight,
          })
          .png()
          .toBuffer()
      : overlay.input;

  return {
    ...overlay,
    input,
    left: visibleLeft,
    top: visibleTop,
  };
}

function measureTextWidth(text: string, fontSize: number): number {
  const cacheKey = `${fontSize}:${text}`;
  const cachedWidth = textWidthCache.get(cacheKey);

  if (typeof cachedWidth === "number") {
    return cachedWidth;
  }

  const width = measureCanvasTextWidth(text, fontPath, fontFamily, fontSize, letterSpacing);
  textWidthCache.set(cacheKey, width);
  return width;
}

function fitFontSize(
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number,
): number {
  let low = minimumSize;
  let high = initialSize;
  let best = minimumSize;

  while (low <= high) {
    const fontSize = Math.floor((low + high) / 2);
    const width = measureTextWidth(text, fontSize);

    if (width <= maxWidth) {
      best = fontSize;
      low = fontSize + 1;
    } else {
      high = fontSize - 1;
    }
  }

  return best;
}

function wrapTextLines(
  items: string[],
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  suffixFill?: string,
): { text: string; truncatedCount: number; suffixFill?: string } {
  const lines: string[] = [];
  let currentLine = "";

  for (let index = 0; index < items.length; index += 1) {
    const isLastItem = index === items.length - 1;
    const token = `${items[index]}${isLastItem ? "" : ", "}`;
    const candidate = currentLine ? `${currentLine}${token}` : token;

    if (measureTextWidth(candidate, fontSize) <= maxWidth || currentLine.length === 0) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);

    if (lines.length === maxLines) {
      let truncatedCount = items.length - index;
      let finalLine = lines[lines.length - 1] ?? "";

      while (truncatedCount > 0) {
        const suffix = `${finalLine.length > 0 ? " " : ""}(+${truncatedCount} more...)`;

        if (measureTextWidth(`${finalLine}${suffix}`, fontSize) <= maxWidth) {
          lines[lines.length - 1] = `${finalLine}${suffix}`;
          return { text: lines.join("\n"), truncatedCount, suffixFill };
        }

        const trimmedLine = finalLine.replace(/[^,]*,\s*$/, "").trimEnd();

        if (trimmedLine === finalLine) {
          lines[lines.length - 1] = `(+${truncatedCount} more...)`;
          return { text: lines.join("\n"), truncatedCount, suffixFill };
        }

        finalLine = trimmedLine;
        truncatedCount += 1;
      }
    }

    currentLine = token;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return { text: lines.join("\n"), truncatedCount: 0 };
}

function wrapWords(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
): string {
  const words = text.split(/\s+/).filter((word) => word.length > 0);

  if (words.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let currentLine = words[0] ?? "";

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]!;
    const candidate = `${currentLine} ${word}`;

    if (measureTextWidth(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);

    if (lines.length === maxLines) {
      return lines.join("\n");
    }

    currentLine = word;
  }

  lines.push(currentLine);
  return lines.slice(0, maxLines).join("\n");
}

function buildColoredLines(
  rewards: LootpoolReward[],
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  defaultFill: string,
): ColoredLine[] {
  const lines: ColoredLine[] = [];
  let currentTokens: ColoredToken[] = [];
  let currentWidth = 0;

  for (let index = 0; index < rewards.length; index += 1) {
    const reward = rewards[index]!;
    const isLastReward = index === rewards.length - 1;
    const tokenText = `${formatRewardLabel(reward)}${isLastReward ? "" : ", "}`;
    const tokenWidth = measureTextWidth(tokenText, fontSize);
    const token: ColoredToken = {
      text: tokenText,
      fill: getRewardTextColor(reward),
      ...getRewardTextStroke(reward),
    };

    if (currentWidth + tokenWidth <= maxWidth || currentTokens.length === 0) {
      currentTokens.push(token);
      currentWidth += tokenWidth;
      continue;
    }

    lines.push({ tokens: currentTokens });

    if (lines.length === maxLines) {
      let truncatedCount = rewards.length - index;
      let finalTokens = [...(lines[lines.length - 1]?.tokens ?? [])];

      while (truncatedCount > 0) {
        const suffix = `${finalTokens.length > 0 ? " " : ""}(+${truncatedCount} more...)`;
        const suffixWidth = measureTextWidth(suffix, fontSize);
        const finalWidth = finalTokens.reduce(
          (total, entry) => total + measureTextWidth(entry.text, fontSize),
          0,
        );

        if (finalWidth + suffixWidth <= maxWidth) {
          finalTokens.push({ text: suffix, fill: defaultFill });
          lines[lines.length - 1] = { tokens: finalTokens };
          return lines;
        }

        if (finalTokens.length === 0) {
          lines[lines.length - 1] = {
            tokens: [{ text: `(+${truncatedCount} more...)`, fill: defaultFill }],
          };
          return lines;
        }

        finalTokens.pop();
        truncatedCount += 1;
      }
    }

    currentTokens = [token];
    currentWidth = tokenWidth;
  }

  if (currentTokens.length > 0) {
    lines.push({ tokens: currentTokens });
  }

  return lines;
}

function formatFooterDate(date: Date, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
}

function normalizeCamp(value: unknown): LootpoolCamp | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const internalName = typeof input.internalName === "string" ? input.internalName.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim() : "";
  const rewards = Array.isArray(input.rewards)
    ? input.rewards.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }

        const reward = entry as Record<string, unknown>;
        const rewardName = typeof reward.name === "string" ? reward.name : "";
        const rewardType = typeof reward.type === "string" ? reward.type : "";
        const amount = typeof reward.amount === "number" ? reward.amount : 0;

        if (!rewardName || !rewardType || amount <= 0) {
          return [];
        }

        return [{
          name: rewardName,
          type: rewardType,
          amount,
          tier: typeof reward.tier === "string" ? reward.tier : undefined,
          shiny: reward.shiny === true,
        }];
      })
    : [];

  if (!name || !internalName || type !== "CAMP") {
    return null;
  }

  return {
    name,
    internalName,
    type,
    rewards,
  };
}

async function loadLootpoolCamps(): Promise<LootpoolCamp[]> {
  const now = Date.now();

  if (cachedLootpoolCamps && cachedLootpoolCamps.expiresAt > now) {
    return cachedLootpoolCamps.camps;
  }

  if (!lootpoolFetchPromise) {
    lootpoolFetchPromise = (async () => {
      const response = await fetchWithWynncraftAuthFallback(lootpoolUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Wynncraft camps request failed with HTTP ${response.status}.`);
      }

      const payload = await response.json();

      if (!Array.isArray(payload)) {
        throw new Error("Wynncraft camps response was not an array.");
      }

      const camps = payload
        .map((entry) => normalizeCamp(entry))
        .filter((entry): entry is LootpoolCamp => entry !== null);

      if (camps.length === 0) {
        throw new Error("Wynncraft camps response did not contain any camps.");
      }

      cachedLootpoolCamps = {
        expiresAt: Date.now() + lootpoolCacheTtlMs,
        camps,
      };

      return camps;
    })().finally(() => {
      lootpoolFetchPromise = null;
    });
  }

  return lootpoolFetchPromise;
}

export async function fetchLootpoolMetadata(): Promise<LootpoolMetadata> {
  const camps = await loadLootpoolCamps();
  const defaultCamp = camps[0];

  if (!defaultCamp) {
    throw new Error("No lootpool camps are available.");
  }

  return {
    defaultCampInternalName: "global",
    camps: camps.map((camp) => ({
      name: camp.name,
      internalName: camp.internalName,
    })),
  };
}

function isCorkianReward(reward: LootpoolReward): boolean {
  const key = getRewardKey(reward.name);
  return key === "insulator" || key === "simulator";
}

function isEligibleLootpoolReward(reward: LootpoolReward): boolean {
  return reward.tier === "MYTHIC" || reward.type === "WARD" || isCorkianReward(reward);
}

function sumRewardAmount(rewards: LootpoolReward[], key: string): number {
  return rewards
    .filter((reward) => getRewardKey(reward.name) === key)
    .reduce((total, reward) => total + reward.amount, 0);
}

function summarizeCamp(camp: LootpoolCamp): LootpoolCampSummary {
  const shinyReward =
    camp.rewards.find((reward) => reward.shiny === true && reward.tier === "MYTHIC") ?? null;
  const eligibleRewards = camp.rewards.filter((reward) => {
    if (!isEligibleLootpoolReward(reward)) {
      return false;
    }

    if (!shinyReward) {
      return true;
    }

    return getRewardKey(reward.name) !== getRewardKey(shinyReward.name);
  });
  const rewardsByTier: Record<LootpoolTier, LootpoolReward[]> = {
    FABLED: camp.rewards.filter((reward) => reward.tier === "FABLED"),
    LEGENDARY: camp.rewards.filter((reward) => reward.tier === "LEGENDARY"),
    RARE: camp.rewards.filter((reward) => reward.tier === "RARE"),
    UNIQUE: camp.rewards.filter((reward) => reward.tier === "UNIQUE"),
  };

  return {
    shinyReward,
    eligibleRewards,
    rewardsByTier,
    liquidEmeraldAmount: sumRewardAmount(camp.rewards, "liquid emerald"),
    emeraldBlockAmount: sumRewardAmount(camp.rewards, "emerald block"),
    runeAmounts: {
      Nii: sumRewardAmount(camp.rewards, "nii rune"),
      Uth: sumRewardAmount(camp.rewards, "uth rune"),
      Tol: sumRewardAmount(camp.rewards, "tol rune"),
    },
  };
}

function formatRewardLabel(reward: LootpoolReward): string {
  const displayName = getDisplayRewardName(reward.name);
  return reward.amount > 1 ? `${displayName} x${reward.amount}` : displayName;
}

function getRewardTextColor(reward: LootpoolReward): string {
  const displayName = getDisplayRewardName(reward.name);
  return wardColors[displayName] ?? mythicTextColor;
}

function getRewardTextStroke(reward: LootpoolReward): Pick<TextLayer, "stroke" | "strokeWidth"> {
  return getDisplayRewardName(reward.name) === "Orange Ward"
    ? { stroke: textColor, strokeWidth: 3 }
    : {};
}

function getRewardSpriteDescriptor(name: string): SpriteDescriptor | null {
  return spriteDescriptors.get(getDisplayRewardName(name).toLowerCase()) ?? null;
}

async function extractSprite(
  descriptor: SpriteDescriptor,
  outputWidth: number,
  outputHeight: number,
): Promise<Buffer> {
  const cacheKey = `${descriptor.sheet}:${descriptor.x}:${descriptor.y}:${outputWidth}:${outputHeight}`;
  const cached = spriteBufferCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const sourceBuffer =
      descriptor.sheet === "icons"
        ? (descriptor.iconSheetVariant === "sheet2" ? iconSheetTwoBuffer : iconSheetBuffer)
        : descriptor.sheet === "weps"
          ? weaponSheetBuffer
          : armorSheetBuffer;
    const cellSize = descriptor.sheet === "weps" ? 30 : 32;

    return sharp(sourceBuffer)
      .extract({
        left: descriptor.x * cellSize,
        top: descriptor.y * cellSize,
        width: cellSize,
        height: cellSize,
      })
      .resize({
        width: outputWidth,
        height: outputHeight,
        fit: "fill",
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
  })();

  spriteBufferCache.set(cacheKey, promise);
  return promise;
}

async function buildSpriteOverlay(args: {
  rewardName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<sharp.OverlayOptions | null> {
  const descriptor = getRewardSpriteDescriptor(args.rewardName);

  if (!descriptor) {
    return null;
  }

  return {
    input: await extractSprite(descriptor, args.width, args.height),
    left: args.x,
    top: args.y,
  };
}

async function renderCampView(
  camp: LootpoolCamp,
  requestedBy: string,
  generatedAt: Date,
  timeZone?: string | null,
): Promise<Buffer> {
  const summary = summarizeCamp(camp);
  const rectLayers: RectLayer[] = [
    { x: 100, y: 205, width: 1930, height: 5, fill: textColor, opacity: 0.8 },
    { x: 100, y: 330, width: 1930, height: 5, fill: textColor, opacity: 0.8 },
    { x: 800, y: 355, width: 5, height: 1080, fill: textColor, opacity: 0.8 },
    { x: 825, y: 600, width: 1230, height: 5, fill: textColor, opacity: 0.8 },
    { x: 825, y: 800, width: 1230, height: 5, fill: textColor, opacity: 0.8 },
    { x: 825, y: 1000, width: 1230, height: 5, fill: textColor, opacity: 0.8 },
    { x: 825, y: 1200, width: 1230, height: 5, fill: textColor, opacity: 0.8 },
  ];
  const textLayers: TextLayer[] = [];
  const iconOverlays: Promise<sharp.OverlayOptions | null>[] = [];
  const renderedCampTitle = wrapWords(camp.name, 1750, 60, 2) || camp.name;
  const campTitleLineCount = renderedCampTitle.split("\n").length;

  textLayers.push({
    text: renderedCampTitle,
    x: 100,
    y: campTitleLineCount > 1 ? 120 : 130,
    fontSize: 60,
    fill: textColor,
  });

  if (summary.shinyReward) {
    iconOverlays.push(
      buildSpriteOverlay({
        rewardName: "Shiny",
        x: 108,
        y: 238,
        width: 64,
        height: 64,
      }),
      buildSpriteOverlay({
        rewardName: summary.shinyReward.name,
        x: 208,
        y: 238,
        width: 64,
        height: 64,
      }),
    );
    textLayers.push({
      text: `Shiny ${getDisplayRewardName(summary.shinyReward.name)}`,
      x: 300,
      y: 242.5,
      fontSize: 50,
      fill: mythicTextColor,
    });
  }

  const eligibleRows = summary.eligibleRewards.slice(0, 12);

  for (const [index, reward] of eligibleRows.entries()) {
    const y = 355 + index * 100;
    iconOverlays.push(
      buildSpriteOverlay({
        rewardName: reward.name,
        x: 108,
        y: y + 8,
        width: 64,
        height: 64,
      }),
    );
    textLayers.push({
      text: formatRewardLabel(reward),
      x: 200,
      y: y + 12.5,
      fontSize: 50,
      fill: getRewardTextColor(reward),
      ...getRewardTextStroke(reward),
    });
  }

  const sectionConfigs: Array<{
    tier: LootpoolTier;
    x: number;
    y: number;
    maxLines: number;
  }> = [
    { tier: "FABLED", x: 825, y: 367.5, maxLines: 4 },
    { tier: "LEGENDARY", x: 825, y: 625, maxLines: 3 },
    { tier: "RARE", x: 825, y: 825, maxLines: 3 },
    { tier: "UNIQUE", x: 825, y: 1025, maxLines: 3 },
  ];

  for (const section of sectionConfigs) {
    const items = summary.rewardsByTier[section.tier].map((reward) => formatRewardLabel(reward));
    const wrapped = wrapTextLines(items, 1175, 50, section.maxLines);

    if (!wrapped.text) {
      continue;
    }

    textLayers.push({
      text: wrapped.text,
      x: section.x,
      y: section.y,
      fontSize: 50,
      fill: tierColors[section.tier],
    });
  }

  if (summary.liquidEmeraldAmount > 0) {
    iconOverlays.push(
      buildSpriteOverlay({
        rewardName: "Liquid Emerald",
        x: 833,
        y: 1233,
        width: 64,
        height: 64,
      }),
    );
    textLayers.push({
      text: `Liquid Emerald x${summary.liquidEmeraldAmount}`,
      x: 925,
      y: 1237.5,
      fontSize: 50,
      fill: textColor,
    });
  }

  if (summary.emeraldBlockAmount > 0) {
    iconOverlays.push(
      buildSpriteOverlay({
        rewardName: "Emerald Block",
        x: 833,
        y: 1333,
        width: 64,
        height: 64,
      }),
    );
    textLayers.push({
      text: `Emerald Block x${summary.emeraldBlockAmount}`,
      x: 925,
      y: 1337.5,
      fontSize: 50,
      fill: textColor,
    });
  }

  const runeConfigs: Array<{
    rewardName: "Nii Rune" | "Uth Rune" | "Tol Rune";
    amount: number;
    boxY: number;
    textY: number;
  }> = [
    { rewardName: "Nii Rune", amount: summary.runeAmounts.Nii, boxY: 1220, textY: 1230 },
    { rewardName: "Uth Rune", amount: summary.runeAmounts.Uth, boxY: 1295, textY: 1305 },
    { rewardName: "Tol Rune", amount: summary.runeAmounts.Tol, boxY: 1370, textY: 1380 },
  ];

  for (const rune of runeConfigs) {
    if (rune.amount <= 0) {
      continue;
    }

    iconOverlays.push(
      buildSpriteOverlay({
        rewardName: rune.rewardName,
        x: 1557,
        y: rune.boxY + 7,
        width: 56,
        height: 56,
      }),
    );
    textLayers.push({
      text: `${rune.rewardName} x${rune.amount}`,
      x: 1640,
      y: rune.textY,
      fontSize: 44,
      fill: textColor,
    });
  }

  textLayers.push({
    text: `Generated at ${formatFooterDate(generatedAt, timeZone)} on request of ${requestedBy}`,
    x: 40,
    y: 1470,
    fontSize: 25,
    fill: textColor,
  });

  let image = sharp(backgroundBuffer)
    .rotate()
    .resize({
      width: imageWidth,
      height: imageHeight,
      fit: backgroundFit,
      position: "centre",
    });
  const composites: sharp.OverlayOptions[] = [
    {
      input: buildShapeOverlaySvg(imageWidth, imageHeight, rectLayers),
      blend: "over",
    },
  ];

  const iconResults = await Promise.all(
    iconOverlays.map((overlay) => overlay.then((value) => normalizeOverlay(value, imageWidth, imageHeight))),
  );

  for (const overlay of iconResults) {
    if (overlay) {
      composites.push(overlay);
    }
  }

  const textResults = await Promise.all(
    textLayers.map(async (layer) => normalizeOverlay(await buildTextOverlay(layer), imageWidth, imageHeight)),
  );

  for (const overlay of textResults) {
    if (overlay) {
      composites.push(overlay);
    }
  }

  image = image.composite(composites);
  return image.png().toBuffer();
}

async function renderGlobalView(
  camps: LootpoolCamp[],
  requestedBy: string,
  generatedAt: Date,
  timeZone?: string | null,
): Promise<Buffer> {
  const rectLayers: RectLayer[] = [
    { x: 100, y: 200, width: 1930, height: 5, fill: textColor, opacity: 1 },
  ];
  const textLayers: TextLayer[] = [
    {
      text: "Lootrun Camp Rewards",
      x: 100,
      y: 120,
      fontSize: 60,
      fill: textColor,
    },
  ];
  const iconOverlays: Promise<sharp.OverlayOptions | null>[] = [];
  const coloredTokenOverlays: Promise<sharp.OverlayOptions | null>[] = [];
  const rowLayouts = [
    { titleY: 220, iconBoxY: 215, iconY: 221, shinyTextY: 220, rewardsY: 290, dividerY: 350 },
    { titleY: 370, iconBoxY: 365, iconY: 371, shinyTextY: 370, rewardsY: 440, dividerY: 500 },
    { titleY: 520, iconBoxY: 515, iconY: 521, shinyTextY: 520, rewardsY: 590, dividerY: 650 },
    { titleY: 670, iconBoxY: 665, iconY: 671, shinyTextY: 670, rewardsY: 740, dividerY: 850 },
    { titleY: 870, iconBoxY: 865, iconY: 871, shinyTextY: 870, rewardsY: 940, dividerY: 1050 },
    { titleY: 1070, iconBoxY: 1065, iconY: 1071, shinyTextY: 1070, rewardsY: 1140, dividerY: 1250 },
    { titleY: 1270, iconBoxY: 1265, iconY: 1271, shinyTextY: 1270, rewardsY: 1340, dividerY: null },
  ] as const;

  for (const [index, camp] of camps.entries()) {
    const layout = rowLayouts[index];

    if (!layout) {
      break;
    }

    const summary = summarizeCamp(camp);
    const titleText = `${camp.name}: `;
    if (layout.dividerY !== null) {
      rectLayers.push({
        x: 100,
        y: layout.dividerY,
        width: 1930,
        height: 5,
        fill: textColor,
        opacity: 1,
      });
    }

    textLayers.push({
      text: titleText,
      x: 100,
      y: layout.titleY,
      fontSize: 50,
      fill: textColor,
    });

    if (summary.shinyReward) {
      iconOverlays.push(
        buildSpriteOverlay({
          rewardName: "Shiny",
          x: 1246,
          y: layout.iconY,
          width: 48,
          height: 48,
        }),
      );
      textLayers.push({
        text: `Shiny ${getDisplayRewardName(summary.shinyReward.name)}`,
        x: 1310,
        y: layout.shinyTextY,
        fontSize: 50,
        fill: mythicTextColor,
      });
    }

    const coloredLines = buildColoredLines(summary.eligibleRewards, 1930, 50, 2, mythicTextColor);

    for (const [lineIndex, line] of coloredLines.entries()) {
      let cursorX = 100;
      const cursorY = layout.rewardsY + lineIndex * 58;

      for (const token of line.tokens) {
        coloredTokenOverlays.push(
          buildTextOverlay({
            text: token.text,
            x: cursorX,
            y: cursorY,
            fontSize: 50,
            fill: token.fill,
            stroke: token.stroke,
            strokeWidth: token.strokeWidth,
          }),
        );
        cursorX += measureTextWidth(token.text, 50);
      }
    }
  }

  textLayers.push({
    text: `Generated at ${formatFooterDate(generatedAt, timeZone)} on request of ${requestedBy}`,
    x: 40,
    y: 1470,
    fontSize: 25,
    fill: textColor,
  });

  let image = sharp(backgroundBuffer)
    .rotate()
    .resize({
      width: imageWidth,
      height: imageHeight,
      fit: backgroundFit,
      position: "centre",
    });
  const composites: sharp.OverlayOptions[] = [
    {
      input: buildShapeOverlaySvg(imageWidth, imageHeight, rectLayers),
      blend: "over",
    },
  ];

  const iconResults = await Promise.all(
    iconOverlays.map((overlay) => overlay.then((value) => normalizeOverlay(value, imageWidth, imageHeight))),
  );

  for (const overlay of iconResults) {
    if (overlay) {
      composites.push(overlay);
    }
  }

  const textResults = await Promise.all([
    ...textLayers.map(async (layer) => normalizeOverlay(await buildTextOverlay(layer), imageWidth, imageHeight)),
    ...coloredTokenOverlays.map((overlay) => overlay.then((value) => normalizeOverlay(value, imageWidth, imageHeight))),
  ]);

  for (const overlay of textResults) {
    if (overlay) {
      composites.push(overlay);
    }
  }

  image = image.composite(composites);
  return image.png().toBuffer();
}

export async function renderLootpoolImage(args: RenderLootpoolArgs): Promise<AttachmentBuilder> {
  const camps = await loadLootpoolCamps();
  const defaultCamp = camps[0];

  if (!defaultCamp) {
    throw new Error("No lootpool camps are available.");
  }

  const generatedAt = args.generatedAt ?? new Date();
  const requestedBy = args.requestedBy.trim() || "etkwynn-api";
  const buffer =
    args.view === "global"
      ? await renderGlobalView(camps, requestedBy, generatedAt, args.timeZone)
      : await renderCampView(
          camps.find((camp) => camp.internalName === args.campInternalName) ?? defaultCamp,
          requestedBy,
          generatedAt,
          args.timeZone,
        );

  return new AttachmentBuilder(buffer, {
    name: "lootpool.png",
  });
}
