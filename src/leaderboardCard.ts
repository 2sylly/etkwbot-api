import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AttachmentBuilder } from "discord.js";
import sharp from "sharp";
import {
  formatDateRangeForTimeZone,
  formatDateTimeForTimeZone
} from "./features/timezone/runtime.js";

type HorizontalAnchor = "left" | "center" | "right";
type VerticalAnchor = "top" | "middle" | "bottom";

type RectLayer = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  fill: string;
  opacity?: number;
  gradient?: string[];
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
};

type LeaderboardCardMode = "current" | "delta";

export type LeaderboardCardRow = {
  rank: number;
  username: string;
  value: number;
};

export type RenderLeaderboardCardArgs = {
  mode: LeaderboardCardMode;
  metricLabel: string;
  rows: LeaderboardCardRow[];
  pageIndex: number;
  totalPages: number;
  requestedBy: string;
  generatedAt?: Date;
  periodLabel?: string | null;
  timeZone?: string | null;
};

type LeaderboardConfig = {
  background: {
    input: string;
    width?: number;
    height?: number;
    fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  };
  font: {
    path: string;
    family?: string;
  };
};

type LeaderboardRowLayout = {
  background?: RectLayer;
  avatarBox?: RectLayer;
  avatarInset?: number;
  nameX: number;
  nameY: number;
  nameFontSize: number;
  nameMaxWidth: number;
  valueX: number;
  valueY: number;
  valueFontSize: number;
  valueMaxWidth: number;
};

export const LEADERBOARD_CARD_FIRST_PAGE_SIZE = 9;
export const LEADERBOARD_CARD_LATER_PAGE_SIZE = 18;

const configPath = new URL("../player-playground.config.json", import.meta.url);
const configDirectory = dirname(fileURLToPath(configPath));
const rawConfig = JSON.parse(
  readFileSync(configPath, "utf8"),
) as LeaderboardConfig;
const backgroundPath = resolve(configDirectory, rawConfig.background.input);
const fontPath = resolve(configDirectory, rawConfig.font.path);
const fontFamily = rawConfig.font.family ?? "Mojangles";
const backgroundBuffer = readFileSync(backgroundPath);
const cardWidth = rawConfig.background.width ?? 1000;
const cardHeight = rawConfig.background.height ?? 1500;
const cardFilename = "leaderboard-card.png";
const bustRenderUrl = "https://identicraft.js.org/bust";
const textColor = "#071018";
const textWidthCache = new Map<string, number>();
const avatarCache = new Map<string, Promise<Buffer | null>>();

const rowLayouts: LeaderboardRowLayout[] = [
  {
    background: {
      x: 75,
      y: 250,
      width: 850,
      height: 200,
      fill: "#B08D2A",
      opacity: 0.8,
      gradient: ["#d8c48b", "#ffe671", "#ffdc54"],
    },
    avatarBox: {
      x: 100,
      y: 275,
      width: 150,
      height: 150,
      fill: textColor,
      opacity: 0.8,
    },
    avatarInset: 6,
    nameX: 275,
    nameY: 300,
    nameFontSize: 60,
    nameMaxWidth: 520,
    valueX: 900,
    valueY: 375,
    valueFontSize: 60,
    valueMaxWidth: 180,
  },
  {
    background: {
      x: 87.5,
      y: 475,
      width: 825,
      height: 175,
      fill: "#A7B0B8",
      opacity: 0.8,
      gradient: ["#aeb7bf", "#dce6f1", "#bdc8d4"],
    },
    avatarBox: {
      x: 105,
      y: 495,
      width: 137.5,
      height: 137.5,
      fill: textColor,
      opacity: 0.8,
    },
    avatarInset: 6,
    nameX: 275,
    nameY: 512.5,
    nameFontSize: 57.5,
    nameMaxWidth: 510,
    valueX: 893.75,
    valueY: 587.5,
    valueFontSize: 57.5,
    valueMaxWidth: 175,
  },
  {
    background: {
      x: 100,
      y: 675,
      width: 800,
      height: 169.7,
      fill: "#8A5A2B",
      opacity: 0.8,
      gradient: ["#c78255", "#f1b28d", "#c67345"],
    },
    avatarBox: {
      x: 117,
      y: 694.4,
      width: 133.33,
      height: 133.33,
      fill: textColor,
      opacity: 0.8,
    },
    avatarInset: 6,
    nameX: 281.82,
    nameY: 711.36,
    nameFontSize: 55.76,
    nameMaxWidth: 500,
    valueX: 881.82,
    valueY: 784.09,
    valueFontSize: 55.76,
    valueMaxWidth: 170,
  },
  {
    background: {
      x: 100,
      y: 875,
      width: 800,
      height: 100,
      fill: "#F2F4F7",
      opacity: 0.8,
    },
    nameX: 125,
    nameY: 900,
    nameFontSize: 54,
    nameMaxWidth: 600,
    valueX: 881.82,
    valueY: 900,
    valueFontSize: 54,
    valueMaxWidth: 170,
  },
  {
    background: {
      x: 100,
      y: 1000,
      width: 800,
      height: 100,
      fill: "#F2F4F7",
      opacity: 0.8,
    },
    nameX: 125,
    nameY: 1025,
    nameFontSize: 54,
    nameMaxWidth: 600,
    valueX: 881.82,
    valueY: 1025,
    valueFontSize: 54,
    valueMaxWidth: 170,
  },
  {
    nameX: 125,
    nameY: 1125,
    nameFontSize: 54,
    nameMaxWidth: 600,
    valueX: 881.82,
    valueY: 1125,
    valueFontSize: 54,
    valueMaxWidth: 170,
  },
  {
    nameX: 125,
    nameY: 1200,
    nameFontSize: 54,
    nameMaxWidth: 600,
    valueX: 881.82,
    valueY: 1200,
    valueFontSize: 54,
    valueMaxWidth: 170,
  },
  {
    nameX: 125,
    nameY: 1275,
    nameFontSize: 54,
    nameMaxWidth: 600,
    valueX: 881.82,
    valueY: 1275,
    valueFontSize: 54,
    valueMaxWidth: 170,
  },
  {
    nameX: 125,
    nameY: 1350,
    nameFontSize: 54,
    nameMaxWidth: 600,
    valueX: 881.82,
    valueY: 1350,
    valueFontSize: 54,
    valueMaxWidth: 170,
  },
];

const laterPageRowLayouts: LeaderboardRowLayout[] = Array.from(
  { length: LEADERBOARD_CARD_LATER_PAGE_SIZE },
  (_, index) => ({
    nameX: 125,
    nameY: 250 + (index * 65),
    nameFontSize: 54,
    nameMaxWidth: 600,
    valueX: 881.82,
    valueY: 250 + (index * 65),
    valueFontSize: 54,
    valueMaxWidth: 170,
  }),
);

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

function buildShapeOverlaySvg(
  width: number,
  height: number,
  layers: RectLayer[],
): Buffer {
  const defs: string[] = [];
  const rects: string[] = [];

  for (const [index, layer] of layers.entries()) {
    const radius = layer.radius ?? 0;
    const gradientId = `row-gradient-${index}`;
    const gradientStops =
      Array.isArray(layer.gradient) && layer.gradient.length >= 2
        ? layer.gradient
        : null;
    const hasGradient = gradientStops !== null;

    if (hasGradient) {
      defs.push(`
<linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
  ${gradientStops
    .map((color, stopIndex) => {
      const offset =
        gradientStops.length === 1
          ? 0
          : (stopIndex / (gradientStops.length - 1)) * 100;

      return `<stop offset="${offset}%" stop-color="${escapeXml(color)}" />`;
    })
    .join("\n  ")}
</linearGradient>`);
    }

    rects.push(
      `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${radius}" ry="${radius}" fill="${hasGradient ? `url(#${gradientId})` : escapeXml(layer.fill)}" opacity="${formatOpacity(layer.opacity)}" />`,
    );
  }

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs.length > 0 ? `<defs>${defs.join("\n")}</defs>` : ""}
  ${rects.join("\n  ")}
</svg>`);
}

function buildGlintOverlaySvg(
  width: number,
  height: number,
  layers: RectLayer[],
): Buffer {
  const defs = layers
    .map((layer, index) => {
      const radius = layer.radius ?? 0;
      const blur = Math.max(8, Math.min(18, layer.height * 0.09));

      return `<clipPath id="glint-clip-${index}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${radius}" ry="${radius}" /></clipPath>
<linearGradient id="glint-streak-${index}" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
  <stop offset="30%" stop-color="#ffffff" stop-opacity="0" />
  <stop offset="45%" stop-color="#ffffff" stop-opacity="0.08" />
  <stop offset="50%" stop-color="#ffffff" stop-opacity="0.16" />
  <stop offset="55%" stop-color="#fff7d2" stop-opacity="0.1" />
  <stop offset="70%" stop-color="#ffffff" stop-opacity="0" />
  <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
</linearGradient>
<filter id="glint-blur-${index}" x="-35%" y="-35%" width="170%" height="170%">
  <feGaussianBlur stdDeviation="${blur}" />
</filter>`;
    })
    .join("");
  const glints = layers
    .map((layer, index) => {
      const streakWidth = layer.width * 0.58;
      const streakHeight = layer.height * 1.55;
      const streakX = layer.x + layer.width * 0.5 - streakWidth / 2;
      const streakY = layer.y + layer.height * 0.46 - streakHeight / 2;
      const centerX = layer.x + layer.width * 0.5;
      const centerY = layer.y + layer.height * 0.46;

      return `<g clip-path="url(#glint-clip-${index})">
  <rect
    x="${streakX}"
    y="${streakY}"
    width="${streakWidth}"
    height="${streakHeight}"
    rx="${Math.max(12, layer.height * 0.22)}"
    ry="${Math.max(12, layer.height * 0.22)}"
    fill="url(#glint-streak-${index})"
    opacity="0.92"
    filter="url(#glint-blur-${index})"
    transform="rotate(-14 ${centerX} ${centerY})"
  />
</g>`;
    })
    .join("");

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${defs}</defs>
  ${glints}
</svg>`);
}

async function applyLayerOpacity(
  buffer: Buffer,
  opacity: number | undefined,
): Promise<Buffer> {
  if (typeof opacity !== "number" || opacity >= 1) {
    return buffer;
  }

  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255)));

  return sharp(buffer)
    .composite([
      {
        input: Buffer.from([0, 0, 0, alpha]),
        raw: {
          width: 1,
          height: 1,
          channels: 4,
        },
        tile: true,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

async function renderTextBuffer(
  text: string,
  layer: TextLayer,
  fill = layer.fill,
): Promise<Buffer> {
  const rendered = await sharp({
    text: {
      text: `<span foreground="${escapeXml(fill)}">${escapeXml(text)}</span>`,
      font: `${fontFamily} ${layer.fontSize}`,
      fontfile: fontPath,
      rgba: true,
    },
  })
    .png()
    .toBuffer();

  return applyLayerOpacity(rendered, layer.opacity);
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

async function buildTextOverlay(
  layer: TextLayer,
): Promise<sharp.OverlayOptions | null> {
  if (!layer.text.trim()) {
    return null;
  }

  const buffer = await renderTextBuffer(layer.text, layer);
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    input: buffer,
    left: getTextLeft(layer, width),
    top: getTextTop(layer, height),
  };
}

async function measureTextWidth(
  text: string,
  fontSize: number,
): Promise<number> {
  const cacheKey = `${fontSize}:${text}`;
  const cached = textWidthCache.get(cacheKey);

  if (typeof cached === "number") {
    return cached;
  }

  const buffer = await renderTextBuffer(text, {
    text,
    x: 0,
    y: 0,
    fontSize,
    fill: textColor,
  });
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  textWidthCache.set(cacheKey, width);
  return width;
}

async function fitFontSize(
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number,
): Promise<number> {
  let low = minimumSize;
  let high = initialSize;
  let best = minimumSize;

  while (low <= high) {
    const fontSize = Math.floor((low + high) / 2);
    const width = await measureTextWidth(text, fontSize);

    if (width <= maxWidth) {
      best = fontSize;
      low = fontSize + 1;
    } else {
      high = fontSize - 1;
    }
  }

  return best;
}

function formatLeaderboardValue(
  mode: LeaderboardCardMode,
  value: number,
): string {
  if (mode === "current") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

async function fetchAvatar(
  username: string,
  size: number,
): Promise<Buffer | null> {
  const cacheKey = `${username}:${size}`;
  const cached = avatarCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const promise = fetch(
    `${bustRenderUrl}/${encodeURIComponent(username)}/${Math.max(size * 2, 128)}.png`,
  )
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return sharp(Buffer.from(arrayBuffer))
        .resize({
          width: size,
          height: size,
          fit: "cover",
          position: "north",
        })
        .png()
        .toBuffer();
    })
    .catch(() => null);

  avatarCache.set(cacheKey, promise);
  return promise;
}

export function formatLeaderboardCardPeriod(
  startDate: Date,
  endDate: Date,
  timeZone?: string | null
): string {
  return formatDateRangeForTimeZone(startDate, endDate, timeZone);
}

export async function renderLeaderboardCard(
  args: RenderLeaderboardCardArgs,
): Promise<AttachmentBuilder> {
  const activeRowLayouts = args.pageIndex === 0 ? rowLayouts : laterPageRowLayouts;
  let image = sharp(backgroundBuffer)
    .rotate()
    .resize({
      width: cardWidth,
      height: cardHeight,
      fit: rawConfig.background.fit ?? "cover",
      position: "centre",
    });

  const rectLayers: RectLayer[] = [
    {
      x: 100,
      y: 225,
      width: 800,
      height: 5,
      fill: textColor,
      opacity: 0.8,
    },
  ];

  for (const [index, row] of args.rows.entries()) {
    const layout = activeRowLayouts[index];

    if (!layout) {
      break;
    }

    if (layout.background) {
      rectLayers.push(layout.background);
    }

    if (layout.avatarBox) {
      rectLayers.push(layout.avatarBox);
    }
  }

  const composites: sharp.OverlayOptions[] = [
    {
      input: buildShapeOverlaySvg(cardWidth, cardHeight, rectLayers),
      blend: "over",
    },
  ];
  const podiumGlintLayers = args.pageIndex === 0
    ? args.rows
      .slice(0, 3)
      .map((_, index) => activeRowLayouts[index]?.background)
      .filter((layer): layer is RectLayer => Boolean(layer))
    : [];

  if (podiumGlintLayers.length > 0) {
    composites.push({
      input: buildGlintOverlaySvg(cardWidth, cardHeight, podiumGlintLayers),
      blend: "screen",
    });
  }

  const titleText = `${args.metricLabel} Leaderboard`;
  const titleFontSize = await fitFontSize(titleText, 740, 60, 38);
  const textLayers: TextLayer[] = [
    {
      text: titleText,
      x: 100,
      y: 150,
      fontSize: titleFontSize,
      fill: textColor,
    },
    {
      text: `Page ${args.pageIndex + 1}/${args.totalPages}`,
      x: 881.82,
      y: 1412.5,
      fontSize: 30,
      fill: textColor,
      anchor: "right",
    },
    {
      text: `Generated at ${formatDateTimeForTimeZone(args.generatedAt ?? new Date(), args.timeZone ?? null)} on request of ${args.requestedBy}`,
      x: 40,
      y: 1470,
      fontSize: 25,
      fill: textColor,
    },
  ];

  if (args.mode === "delta" && args.periodLabel) {
    const periodFontSize = await fitFontSize(args.periodLabel, 840, 20, 14);
    textLayers.push({
      text: args.periodLabel,
      x: 940,
      y: 60,
      fontSize: periodFontSize,
      fill: textColor,
      anchor: "right",
    });
  }

  for (const [index, row] of args.rows.entries()) {
    const layout = activeRowLayouts[index];

    if (!layout) {
      break;
    }

    const nameText = `#${row.rank} ${row.username}`;
    const valueText = formatLeaderboardValue(args.mode, row.value);
    const nameFontSize = await fitFontSize(
      nameText,
      layout.nameMaxWidth,
      Math.floor(layout.nameFontSize),
      Math.max(26, Math.floor(layout.nameFontSize * 0.58)),
    );
    const valueFontSize = await fitFontSize(
      valueText,
      layout.valueMaxWidth,
      Math.floor(layout.valueFontSize),
      Math.max(24, Math.floor(layout.valueFontSize * 0.6)),
    );

    textLayers.push(
      {
        text: nameText,
        x: layout.nameX,
        y: layout.nameY,
        fontSize: nameFontSize,
        fill: textColor,
      },
      {
        text: valueText,
        x: layout.valueX,
        y: layout.valueY,
        fontSize: valueFontSize,
        fill: textColor,
        anchor: "right",
      },
    );

    if (layout.avatarBox) {
      const avatarSize = Math.max(
        24,
        Math.round(
          Math.min(layout.avatarBox.width, layout.avatarBox.height) -
            (layout.avatarInset ?? 0) * 2,
        ),
      );
      const avatarBuffer = await fetchAvatar(row.username, avatarSize);

      if (avatarBuffer) {
        composites.push({
          input: avatarBuffer,
          left: Math.round(layout.avatarBox.x + (layout.avatarInset ?? 0)),
          top: Math.round(layout.avatarBox.y + (layout.avatarInset ?? 0)),
        });
      }
    }
  }

  const textOverlays = await Promise.all(
    textLayers.map((layer) => buildTextOverlay(layer)),
  );

  for (const overlay of textOverlays) {
    if (overlay) {
      composites.push(overlay);
    }
  }

  image = image.composite(composites);

  return new AttachmentBuilder(await image.png().toBuffer(), {
    name: cardFilename,
  });
}
