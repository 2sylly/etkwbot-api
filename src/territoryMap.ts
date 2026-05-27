import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AttachmentBuilder } from "discord.js";
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type Canvas,
  type Image,
  type SKRSContext2D
} from "@napi-rs/canvas";
import sharp from "sharp";
import { resolvePreferredFontPathFromUrl } from "./fontPath.js";

import type {
  TerritoryResourceType,
  TerritoryState
} from "./territories.js";

export type TerritoryMapSnapshot = {
  source: "live" | "stored";
  takenAt: Date;
  territoryLastTick: Date | null;
  territories: TerritoryState[];
};

export type RenderTerritoryMapOptions = {
  cropToTerritories?: boolean;
  showChrome?: boolean;
  cacheKeySuffix?: string;
  guildColors?: ReadonlyMap<string, string>;
};

export type RenderTerritoryNeighborhoodMapOptions = {
  guildColors?: ReadonlyMap<string, string>;
};

export type TerritoryMapSimulatorDefaults = {
  outputWidth: number;
  outputHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  mapLeft: number;
  mapTop: number;
  mapWidth: number;
  mapHeight: number;
  worldBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
};

const MAP_OUTPUT_FILENAME = "territory-map.jpg";
export const TERRITORY_NEIGHBORHOOD_MAP_FILENAME = "territory-focus.jpg";
const OUTPUT_MAP_WIDTH = 2000;
const TERRITORY_NEIGHBORHOOD_RENDER_WIDTH = 3000;
const TERRITORY_NEIGHBORHOOD_OUTPUT_WIDTH = 300;
const TERRITORY_NEIGHBORHOOD_OUTPUT_HEIGHT = 300;
const TERRITORY_NEIGHBORHOOD_OVERSCAN_SCALE = 3;
const BASE_MAP_IDLE_TTL_MS = 2 * 60 * 1000;
const MAP_LEFT = 110;
const MAP_TOP = 43;
const MAP_WIDTH = 1700;
const MAP_HEIGHT = 2716.8;
const MAP_FONT_PATH = resolvePreferredFontPathFromUrl(
  new URL("../public/fonts/mojangles.otf", import.meta.url)
);
const MAP_FONT_BASE64 = readFileSync(MAP_FONT_PATH).toString("base64");
const MAP_FONT_FAMILY = "Mojangles";
const BASE_MAP_PATH = fileURLToPath(
  new URL("../public/img/map.png", import.meta.url)
);
const HQ_ICON_BUFFER = readFileSync(
  new URL("../public/img/map-icons/guild_headquarters.png", import.meta.url)
);
const HQ_ICON_DATA_URI = `data:image/png;base64,${HQ_ICON_BUFFER.toString("base64")}`;
const RESOURCE_ICON_BUFFERS: Record<TerritoryResourceType, Buffer> = {
  CROP: readFileSync(
    new URL("../public/img/map-icons/farming.png", import.meta.url)
  ),
  FISH: readFileSync(
    new URL("../public/img/map-icons/fishing.png", import.meta.url)
  ),
  ORE: readFileSync(
    new URL("../public/img/map-icons/mining.png", import.meta.url)
  ),
  WOOD: readFileSync(
    new URL("../public/img/map-icons/woodcutting.png", import.meta.url)
  ),
  EMERALD: readFileSync(
    new URL("../public/img/map-icons/emerald_reward.png", import.meta.url)
  )
};
const RESOURCE_ICON_DATA_URIS: Record<TerritoryResourceType, string> = {
  CROP: `data:image/png;base64,${RESOURCE_ICON_BUFFERS.CROP.toString("base64")}`,
  FISH: `data:image/png;base64,${RESOURCE_ICON_BUFFERS.FISH.toString("base64")}`,
  ORE: `data:image/png;base64,${RESOURCE_ICON_BUFFERS.ORE.toString("base64")}`,
  WOOD: `data:image/png;base64,${RESOURCE_ICON_BUFFERS.WOOD.toString("base64")}`,
  EMERALD: `data:image/png;base64,${RESOURCE_ICON_BUFFERS.EMERALD.toString("base64")}`
};
const RESOURCE_ICON_ORDER: TerritoryResourceType[] = [
  "CROP",
  "FISH",
  "ORE",
  "WOOD",
  "EMERALD"
];

// Derived from the non-black bounds of public/img/map.png.
const SOURCE_MAP_BOUNDS = {
  width: 4608,
  height: 6644,
  left: 79,
  top: 56,
  right: 4210,
  bottom: 6475
} as const;

// Derived from the bundled territory coordinate set in public/territories.json.
const WORLD_BOUNDS = {
  minX: -2291,
  maxX: 1586,
  minZ: -6561,
  maxZ: -250
} as const;

const TERRITORY_FILL_OPACITY = 0.34;
const TERRITORY_STROKE_OPACITY = 0.88;
const LINK_STROKE_OPACITY = 0.55;
const PREFIX_TEXT_OPACITY = 0.94;
const SHADOW_TEXT_OPACITY = 0.82;
const HOLD_TIME_TEXT_OPACITY = 0.95;
const CRC32_TABLE = buildCrc32Table();
const GUILD_FOCUS_CROP_PADDING = 84;

const textWidthCache = new Map<string, number>();
const renderedTextCache = new Map<string, Promise<Buffer>>();
const resizedIconCache = new Map<string, Promise<Buffer>>();
const guildColorCache = new Map<string, GuildColor>();
let cachedRenderKey: string | null = null;
let cachedRenderBuffer: Buffer | null = null;
let pregeneratedDefaultMapSignature: string | null = null;
let pregeneratedDefaultMapBuffer: Buffer | null = null;
let baseMapImagePromise: Promise<Image> | null = null;
let baseMapReleaseTimer: NodeJS.Timeout | null = null;
let canvasIconAssetsPromise: Promise<CanvasIconAssets> | null = null;
let canvasFontRegistered = false;

type MapTextLayer = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  opacity?: number;
  anchor?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
};

type TerritoryBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type ProjectedTerritory = {
  territory: TerritoryState;
  bounds: TerritoryBounds;
  centerX: number;
  centerY: number;
};

type PixelWindow = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type CanvasIconAssets = {
  hqIcon: Image;
  resourceIcons: Record<TerritoryResourceType, Image>;
};

type SizedOverlay = {
  input: Buffer;
  left: number;
  top: number;
  width: number;
  height: number;
};

type GuildColor = {
  hex: string;
  shadow: string;
};

class JavaRandom {
  static readonly MULTIPLIER = 0x5deece66dn;
  static readonly ADDEND = 0xbn;
  static readonly MASK = (1n << 48n) - 1n;

  seed: bigint;

  constructor(seed: number) {
    this.seed =
      (BigInt(seed >>> 0) ^ JavaRandom.MULTIPLIER) & JavaRandom.MASK;
  }

  next(bits: number): number {
    this.seed =
      ((this.seed * JavaRandom.MULTIPLIER) + JavaRandom.ADDEND) &
      JavaRandom.MASK;
    return Number(this.seed >> BigInt(48 - bits));
  }

  nextFloat(): number {
    return this.next(24) / (1 << 24);
  }
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1
        ? (0xedb88320 ^ (value >>> 1))
        : (value >>> 1);
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(value: string): number {
  const bytes = new TextEncoder().encode(value);
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatOpacity(opacity: number | undefined): string {
  if (typeof opacity !== "number") {
    return "1";
  }

  return `${clamp(opacity, 0, 1)}`;
}

function buildSvgText(
  text: string,
  options: {
    x: number;
    y: number;
    fontSize: number;
    fill: string;
    opacity?: number;
    anchor?: "start" | "middle" | "end";
    baseline?: "hanging" | "middle" | "baseline";
    shadowOffset?: number;
    textLength?: number;
  }
): string {
  if (!text.trim()) {
    return "";
  }

  const anchor = options.anchor ?? "start";
  const baseline = options.baseline ?? "baseline";
  const opacity = formatOpacity(options.opacity);
  const textLength =
    typeof options.textLength === "number" && options.textLength > 0
      ? ` textLength="${options.textLength}" lengthAdjust="spacingAndGlyphs"`
      : "";
  const escaped = escapeXml(text);
  const shadowOffset = options.shadowOffset ?? 0;
  const shadow = shadowOffset > 0
    ? `<text x="${options.x + shadowOffset}" y="${options.y + shadowOffset}" font-family="${MAP_FONT_FAMILY}" font-size="${options.fontSize}" fill="#000000" opacity="${SHADOW_TEXT_OPACITY}" text-anchor="${anchor}" dominant-baseline="${baseline}"${textLength}>${escaped}</text>`
    : "";

  return `${shadow}<text x="${options.x}" y="${options.y}" font-family="${MAP_FONT_FAMILY}" font-size="${options.fontSize}" fill="${options.fill}" opacity="${opacity}" text-anchor="${anchor}" dominant-baseline="${baseline}"${textLength}>${escaped}</text>`;
}

function ensureCanvasFontRegistered(): void {
  if (canvasFontRegistered) {
    return;
  }

  GlobalFonts.registerFromPath(MAP_FONT_PATH, MAP_FONT_FAMILY);
  canvasFontRegistered = true;
}

async function loadCanvasIconAssets(): Promise<CanvasIconAssets> {
  if (!canvasIconAssetsPromise) {
    canvasIconAssetsPromise = Promise.all([
      loadImage(HQ_ICON_BUFFER),
      Promise.all(
        RESOURCE_ICON_ORDER.map(async (resourceType) =>
          [resourceType, await loadImage(RESOURCE_ICON_BUFFERS[resourceType])] as const
        )
      )
    ]).then(([hqIcon, resourceEntries]) => ({
      hqIcon,
      resourceIcons: Object.fromEntries(resourceEntries) as Record<TerritoryResourceType, Image>
    }));
  }

  return canvasIconAssetsPromise;
}

function scheduleBaseMapRelease(): void {
  if (baseMapReleaseTimer) {
    clearTimeout(baseMapReleaseTimer);
  }

  baseMapReleaseTimer = setTimeout(() => {
    baseMapImagePromise = null;
    baseMapReleaseTimer = null;
  }, BASE_MAP_IDLE_TTL_MS);
  baseMapReleaseTimer.unref?.();
}

async function loadBaseMapImage(): Promise<Image> {
  if (!baseMapImagePromise) {
    baseMapImagePromise = loadImage(BASE_MAP_PATH);
  }

  scheduleBaseMapRelease();
  return baseMapImagePromise;
}

function setCanvasFont(ctx: SKRSContext2D, fontSize: number): void {
  ctx.font = `${fontSize}px "${MAP_FONT_FAMILY}", "Segoe UI", Arial, sans-serif`;
}

function fitCanvasFontSize(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number
): number {
  let low = minimumSize;
  let high = initialSize;
  let best = minimumSize;

  while (low <= high) {
    const fontSize = Math.floor((low + high) / 2);
    setCanvasFont(ctx, fontSize);
    const width = ctx.measureText(text).width;

    if (width <= maxWidth) {
      best = fontSize;
      low = fontSize + 1;
    } else {
      high = fontSize - 1;
    }
  }

  return best;
}

function drawCanvasTextWithShadow(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    fontSize: number;
    fill: string;
    opacity?: number;
    textAlign?: CanvasTextAlign;
    textBaseline?: CanvasTextBaseline;
    shadowOffset?: number;
    maxWidth?: number;
  }
): void {
  if (!text.trim()) {
    return;
  }

  ctx.save();
  setCanvasFont(ctx, options.fontSize);
  ctx.textAlign = options.textAlign ?? "left";
  ctx.textBaseline = options.textBaseline ?? "alphabetic";
  const maxWidth = options.maxWidth;
  const shadowOffset = options.shadowOffset ?? 2;

  ctx.globalAlpha = SHADOW_TEXT_OPACITY;
  ctx.fillStyle = "#000000";
  if (typeof maxWidth === "number") {
    ctx.fillText(text, x + shadowOffset, y + shadowOffset, maxWidth);
  } else {
    ctx.fillText(text, x + shadowOffset, y + shadowOffset);
  }

  ctx.globalAlpha = clamp(options.opacity ?? 1, 0, 1);
  ctx.fillStyle = options.fill;
  if (typeof maxWidth === "number") {
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

async function applyLayerOpacity(
  buffer: Buffer,
  opacity: number | undefined
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
          channels: 4
        },
        tile: true,
        blend: "dest-in"
      }
    ])
    .png()
    .toBuffer();
}

async function getResizedIconBuffer(
  cacheKey: string,
  buffer: Buffer,
  size: number
): Promise<Buffer> {
  const cached = resizedIconCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const resized = sharp(buffer)
    .resize({
      width: size,
      height: size,
      fit: "contain",
      kernel: sharp.kernel.nearest,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .png()
    .toBuffer();

  resizedIconCache.set(cacheKey, resized);
  return resized;
}

async function renderTextBuffer(
  text: string,
  layer: MapTextLayer
): Promise<Buffer> {
  const cacheKey = [
    layer.fontSize,
    layer.fill,
    formatOpacity(layer.opacity),
    text
  ].join(":");
  const cached = renderedTextCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const rendered = sharp({
    text: {
      text: `<span foreground="${escapeXml(layer.fill)}">${escapeXml(text)}</span>`,
      font: `${MAP_FONT_FAMILY} ${layer.fontSize}`,
      fontfile: MAP_FONT_PATH,
      rgba: true
    }
  })
    .png()
    .toBuffer()
    .then((buffer) => applyLayerOpacity(buffer, layer.opacity));

  renderedTextCache.set(cacheKey, rendered);
  return rendered;
}

async function measureTextWidth(
  text: string,
  fontSize: number,
  fill = "#ffffff"
): Promise<number> {
  const cacheKey = `${fontSize}:${fill}:${text}`;
  const cached = textWidthCache.get(cacheKey);

  if (typeof cached === "number") {
    return cached;
  }

  const buffer = await renderTextBuffer(text, {
    text,
    x: 0,
    y: 0,
    fontSize,
    fill
  });
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  textWidthCache.set(cacheKey, width);
  return width;
}

function getTextTop(layer: MapTextLayer, renderedHeight: number): number {
  switch (layer.verticalAlign) {
    case "middle":
      return Math.round(layer.y - renderedHeight / 2);
    case "bottom":
      return Math.round(layer.y - renderedHeight);
    default:
      return Math.round(layer.y);
  }
}

function getTextLeft(layer: MapTextLayer, renderedWidth: number): number {
  switch (layer.anchor) {
    case "center":
      return Math.round(layer.x - renderedWidth / 2);
    case "right":
      return Math.round(layer.x - renderedWidth);
    default:
      return Math.round(layer.x);
  }
}

async function buildTextOverlay(
  layer: MapTextLayer
): Promise<SizedOverlay | null> {
  if (!layer.text.trim()) {
    return null;
  }

  const buffer = await renderTextBuffer(layer.text, layer);
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  return {
    input: buffer,
    left: getTextLeft(layer, width),
    top: getTextTop(layer, height),
    width,
    height
  };
}

async function fitOverlayWithinCanvas(
  overlay: SizedOverlay | null,
  canvasWidth: number,
  canvasHeight: number
): Promise<sharp.OverlayOptions | null> {
  if (!overlay) {
    return null;
  }

  if (
    overlay.width <= 0 ||
    overlay.height <= 0 ||
    overlay.width > canvasWidth ||
    overlay.height > canvasHeight
  ) {
    return null;
  }

  return {
    input: overlay.input,
    left: clamp(overlay.left ?? 0, 0, Math.max(0, canvasWidth - overlay.width)),
    top: clamp(overlay.top ?? 0, 0, Math.max(0, canvasHeight - overlay.height))
  };
}

async function fitFontSize(
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number
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

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) =>
      clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")
    )
    .join("")}`;
}

function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function customColorFromHsv(
  hue: number,
  saturation: number,
  value: number
): [number, number, number] {
  if (value <= 0) {
    return [0, 0, 0];
  }

  const normalizedValue = clamp(value, 0, 1);
  const normalizedSaturation = clamp(saturation, 0, 1);

  if (normalizedSaturation <= 0) {
    const channel = Math.trunc(normalizedValue * 255);
    return [channel, channel, channel];
  }

  const wrappedHue = (((hue % 1) + 1) * 6) % 6;
  const segment = Math.floor(wrappedHue);
  const v1 = normalizedValue * (1 - normalizedSaturation);
  const v2 =
    normalizedValue * (1 - (normalizedSaturation * (wrappedHue - segment)));
  const v3 =
    normalizedValue *
    (1 - (normalizedSaturation * (1 - (wrappedHue - segment))));

  const [red, green, blue] = [
    [normalizedValue, v3, v1],
    [v2, normalizedValue, v1],
    [v1, normalizedValue, v3],
    [v1, v2, normalizedValue],
    [v3, v1, normalizedValue],
    [normalizedValue, v1, v2]
  ][segment] ?? [normalizedValue, v1, v2];

  return [
    Math.trunc(red * 255),
    Math.trunc(green * 255),
    Math.trunc(blue * 255)
  ];
}

function getGuildColor(guildName: string, explicitHex?: string | null): GuildColor {
  const normalizedHex = normalizeHexColor(explicitHex);

  if (normalizedHex) {
    return {
      hex: normalizedHex,
      shadow: "#091016"
    };
  }

  const normalized = guildName.trim() || "Unknown Guild";
  const cached = guildColorCache.get(normalized);

  if (cached) {
    return cached;
  }

  const random = new JavaRandom(crc32(normalized));
  const minSaturation = 0.5;
  const minValue = 0.75;
  const rgb = customColorFromHsv(
    random.nextFloat(),
    minSaturation + ((1 - minSaturation) * random.nextFloat()),
    minValue + ((1 - minValue) * random.nextFloat())
  );
  const color = {
    hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
    shadow: "#091016"
  };
  guildColorCache.set(normalized, color);
  return color;
}

function formatUtcTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hour = `${date.getUTCHours()}`.padStart(2, "0");
  const minute = `${date.getUTCMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function formatHeldDurationShort(
  acquiredAt: string | null,
  referenceDate: Date
): string | null {
  if (!acquiredAt) {
    return null;
  }

  const acquiredDate = new Date(acquiredAt);

  if (Number.isNaN(acquiredDate.getTime())) {
    return null;
  }

  const diffMs = Math.max(0, referenceDate.getTime() - acquiredDate.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 60) {
    return `${Math.max(1, diffMinutes)}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 14) {
    return `${diffDays}d`;
  }

  const diffWeeks = Math.floor(diffDays / 7);

  if (diffWeeks < 8) {
    return `${diffWeeks}w`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return `${Math.max(1, diffMonths)}mo`;
}

function formatHeldDurationNeighborhood(
  acquiredAt: string | null,
  referenceDate: Date
): string | null {
  if (!acquiredAt) {
    return null;
  }

  const acquiredDate = new Date(acquiredAt);

  if (Number.isNaN(acquiredDate.getTime())) {
    return null;
  }

  const diffSeconds = Math.max(
    0,
    Math.floor((referenceDate.getTime() - acquiredDate.getTime()) / 1000)
  );
  const days = Math.floor(diffSeconds / 86_400);
  const hours = Math.floor((diffSeconds % 86_400) / 3_600);
  const minutes = Math.floor((diffSeconds % 3_600) / 60);
  const seconds = diffSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function getTerritoryBounds(territory: TerritoryState): TerritoryBounds | null {
  if (
    territory.startX === null ||
    territory.endX === null ||
    territory.startZ === null ||
    territory.endZ === null
  ) {
    return null;
  }

  return {
    left: Math.min(territory.startX, territory.endX),
    right: Math.max(territory.startX, territory.endX),
    top: Math.min(territory.startZ, territory.endZ),
    bottom: Math.max(territory.startZ, territory.endZ),
    width: Math.abs(territory.endX - territory.startX),
    height: Math.abs(territory.endZ - territory.startZ)
  };
}

function getProjectedBounds(
  territory: TerritoryState,
  projectX: (value: number) => number,
  projectY: (value: number) => number
): TerritoryBounds | null {
  const bounds = getTerritoryBounds(territory);

  if (!bounds) {
    return null;
  }

  const projectedLeft = projectX(bounds.left);
  const projectedRight = projectX(bounds.right);
  const projectedTop = projectY(bounds.top);
  const projectedBottom = projectY(bounds.bottom);

  return {
    left: Math.round(Math.min(projectedLeft, projectedRight)),
    right: Math.round(Math.max(projectedLeft, projectedRight)),
    top: Math.round(Math.min(projectedTop, projectedBottom)),
    bottom: Math.round(Math.max(projectedTop, projectedBottom)),
    width: Math.round(Math.abs(projectedRight - projectedLeft)),
    height: Math.round(Math.abs(projectedBottom - projectedTop))
  };
}

function projectTerritories(
  territories: TerritoryState[],
  projectX: (value: number) => number,
  projectY: (value: number) => number
): ProjectedTerritory[] {
  return territories
    .map((territory) => {
      const bounds = getProjectedBounds(territory, projectX, projectY);

      if (!bounds) {
        return null;
      }

      return {
        territory,
        bounds,
        centerX: bounds.left + (bounds.width / 2),
        centerY: bounds.top + (bounds.height / 2)
      };
    })
    .filter((entry): entry is ProjectedTerritory => entry !== null);
}

function boundsIntersectWindow(bounds: TerritoryBounds, window: PixelWindow): boolean {
  return !(
    bounds.right < window.left ||
    bounds.left > window.right ||
    bounds.bottom < window.top ||
    bounds.top > window.bottom
  );
}

function buildTerritoryOverlaySvg(
  projectedTerritories: ProjectedTerritory[],
  canvasWidth: number,
  canvasHeight: number,
  guildColors?: ReadonlyMap<string, string>
): Buffer {
  const territoryByName = new Map(
    projectedTerritories.map((entry) => [entry.territory.territoryName, entry] as const)
  );
  const renderedLinks = new Set<string>();
  const linkLines = projectedTerritories
    .map((entry) => {
      const { territory, centerX: sourceCenterX, centerY: sourceCenterY } = entry;

      return territory.links
        .map((linkedTerritoryName) => {
          const key = [territory.territoryName, linkedTerritoryName]
            .sort((left, right) => left.localeCompare(right))
            .join("::");

          if (renderedLinks.has(key)) {
            return "";
          }

          renderedLinks.add(key);

          const linkedTerritory = territoryByName.get(linkedTerritoryName);

          if (!linkedTerritory) {
            return "";
          }
          const { centerX: targetCenterX, centerY: targetCenterY } = linkedTerritory;

          return `<line x1="${sourceCenterX}" y1="${sourceCenterY}" x2="${targetCenterX}" y2="${targetCenterY}" stroke="#000000" stroke-opacity="${LINK_STROKE_OPACITY}" stroke-width="1.4" stroke-linecap="round" />`;
        })
        .join("");
    })
    .join("");
  const territoryRects = projectedTerritories
    .map(({ territory, bounds }) => {
      const colors = getGuildColor(
        territory.guildName,
        territory.guildColor ?? guildColors?.get(territory.guildPrefix)
      );
      const isHq =
        territory.isHq ||
        territory.hqTerritoryName?.toLowerCase() ===
          territory.territoryName.toLowerCase();

      return `<rect x="${bounds.left}" y="${bounds.top}" width="${Math.max(bounds.width, 2)}" height="${Math.max(bounds.height, 2)}" fill="${colors.hex}" fill-opacity="${TERRITORY_FILL_OPACITY}" stroke="${colors.hex}" stroke-opacity="${TERRITORY_STROKE_OPACITY}" stroke-width="${isHq ? 2.6 : 1.8}" rx="2" ry="2" />`;
    })
    .join("");
  const territoryTexts = projectedTerritories
    .map(({ territory, bounds, centerX, centerY }) => {
      if (bounds.width < 18 || bounds.height < 14) {
        return "";
      }

      const prefix = territory.guildPrefix.trim() || "NONE";
      const colors = getGuildColor(
        territory.guildName || prefix,
        territory.guildColor ?? guildColors?.get(territory.guildPrefix)
      );
      const resourceTypes = RESOURCE_ICON_ORDER.filter((resourceType) =>
        territoryHasResource(territory, resourceType)
      );
      const hasHqIcon =
        territory.isHq ||
        territory.hqTerritoryName?.toLowerCase() ===
          territory.territoryName.toLowerCase();

      const fontSize = clamp(Math.floor(Math.min(bounds.height * 0.36, 24)), 8, 24);
      const prefixHeight = Math.max(12, Math.round(fontSize * 1.12));
      const showHqIcon = hasHqIcon && bounds.width >= 24 && bounds.height >= 30;
      const showResourceIcons =
        resourceTypes.length > 0 && bounds.width >= 28 && bounds.height >= 34;
      const hqIconSize = showHqIcon
        ? clamp(Math.floor(fontSize * 1.35), 16, 28)
        : 0;
      const resourceIconSize = showResourceIcons
        ? clamp(
            Math.min(
              Math.floor(fontSize * 0.88),
              Math.floor(
                (bounds.width - ((resourceTypes.length - 1) * 3) - 4) /
                  Math.max(resourceTypes.length, 1)
              )
            ),
            8,
            16
          )
        : 0;
      const hqRowHeight = showHqIcon ? hqIconSize + 2 : 0;
      const resourceRowHeight = showResourceIcons ? resourceIconSize + 3 : 0;
      const blockHeight = hqRowHeight + prefixHeight + resourceRowHeight;
      const blockTop = Math.round(
        showHqIcon || showResourceIcons
          ? bounds.top + Math.max(1, (bounds.height - blockHeight) / 2)
          : centerY - (prefixHeight / 2)
      );
      const prefixText = buildSvgText(prefix, {
        x: centerX,
        y: showHqIcon || showResourceIcons ? blockTop + hqRowHeight : centerY,
        fontSize,
        fill: colors.hex,
        opacity: PREFIX_TEXT_OPACITY,
        anchor: "middle",
        baseline: showHqIcon || showResourceIcons ? "hanging" : "middle",
        shadowOffset: 2,
        textLength: Math.max(16, bounds.width - 6)
      });
      const hqIcon = showHqIcon
        ? `<image href="${HQ_ICON_DATA_URI}" x="${Math.round(centerX - (hqIconSize / 2))}" y="${blockTop}" width="${hqIconSize}" height="${hqIconSize}" preserveAspectRatio="none" style="image-rendering: pixelated;" />`
        : "";
      const resourceIcons = showResourceIcons
        ? (() => {
            const totalWidth =
              (resourceTypes.length * resourceIconSize) + ((resourceTypes.length - 1) * 3);
            let nextLeft = Math.round(centerX - (totalWidth / 2));

            return resourceTypes
              .map((resourceType) => {
                const icon = `<image href="${RESOURCE_ICON_DATA_URIS[resourceType]}" x="${nextLeft}" y="${blockTop + hqRowHeight + prefixHeight + 2}" width="${resourceIconSize}" height="${resourceIconSize}" preserveAspectRatio="none" style="image-rendering: pixelated;" />`;
                nextLeft += resourceIconSize + 3;
                return icon;
              })
              .join("");
          })()
        : "";

      return `${hqIcon}${resourceIcons}${prefixText}`;
    })
    .join("");

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <style>
    @font-face {
      font-family: '${MAP_FONT_FAMILY}';
      src: url("data:font/otf;base64,${MAP_FONT_BASE64}") format("opentype");
    }
    text {
      white-space: pre;
    }
  </style>
  ${linkLines}
  ${territoryRects}
  ${territoryTexts}
</svg>`);
}

function territoryHasResource(
  territory: TerritoryState,
  resourceType: TerritoryResourceType
): boolean {
  const resource = territory.resources.find((entry) => entry.type === resourceType);
  return (resource?.generation ?? 0) > 0 || (resource?.baseGeneration ?? 0) > 0;
}

async function pushTextWithShadow(
  overlays: sharp.OverlayOptions[],
  layer: MapTextLayer,
  canvasWidth: number,
  canvasHeight: number,
  shadowOffset = 2
): Promise<void> {
  const shadow = await fitOverlayWithinCanvas(await buildTextOverlay({
    ...layer,
    x: layer.x + shadowOffset,
    y: layer.y + shadowOffset,
    fill: "#000000",
    opacity: SHADOW_TEXT_OPACITY
  }), canvasWidth, canvasHeight);

  if (shadow) {
    overlays.push(shadow);
  }

  const textOverlay = await fitOverlayWithinCanvas(
    await buildTextOverlay(layer),
    canvasWidth,
    canvasHeight
  );

  if (textOverlay) {
    overlays.push(textOverlay);
  }
}

async function buildTerritoryOverlays(
  snapshot: TerritoryMapSnapshot,
  territories: TerritoryState[],
  projectX: (value: number) => number,
  projectY: (value: number) => number,
  canvasWidth: number,
  canvasHeight: number,
  guildColors?: ReadonlyMap<string, string>
): Promise<sharp.OverlayOptions[]> {
  void snapshot;
  void territories;
  void projectX;
  void projectY;
  void canvasWidth;
  void canvasHeight;
  void guildColors;
  return [];
}

async function buildChromeOverlays(
  snapshot: TerritoryMapSnapshot,
  territoryCount: number,
  canvasWidth: number,
  canvasHeight: number
): Promise<sharp.OverlayOptions[]> {
  const overlays: sharp.OverlayOptions[] = [];
  const padding = 24;
  const titleFontSize = 30;
  const subtitleFontSize = 16;

  await pushTextWithShadow(overlays, {
    text: "ETKWynn /map",
    x: padding,
    y: padding,
    fontSize: titleFontSize,
    fill: "#f5f8f6",
    anchor: "left",
    verticalAlign: "top"
  }, canvasWidth, canvasHeight);

  await pushTextWithShadow(overlays, {
      text: [
        snapshot.source === "live" ? "LIVE" : "STORED",
        `${territoryCount} TERRITORIES`,
        formatUtcTimestamp(snapshot.territoryLastTick ?? snapshot.takenAt)
      ].join("  |  "),
      x: padding,
      y: padding + 42,
      fontSize: subtitleFontSize,
      fill: "#d4ded7",
      opacity: 0.96,
      anchor: "left",
      verticalAlign: "top"
    }, canvasWidth, canvasHeight, 1);

  return overlays;
}

function drawMapChrome(
  ctx: SKRSContext2D,
  snapshot: TerritoryMapSnapshot,
  territoryCount: number
): void {
  drawCanvasTextWithShadow(ctx, "ETKWynn /map", 24, 24, {
    fontSize: 30,
    fill: "#f5f8f6",
    textAlign: "left",
    textBaseline: "top"
  });

  drawCanvasTextWithShadow(
    ctx,
    [
      snapshot.source === "live" ? "LIVE" : "STORED",
      `${territoryCount} TERRITORIES`,
      formatUtcTimestamp(snapshot.territoryLastTick ?? snapshot.takenAt)
    ].join("  |  "),
    24,
    66,
    {
      fontSize: 16,
      fill: "#d4ded7",
      opacity: 0.96,
      textAlign: "left",
      textBaseline: "top",
      shadowOffset: 1
    }
  );
}

async function renderTerritoryMapCanvasBuffer(
  snapshot: TerritoryMapSnapshot,
  territories: TerritoryState[],
  options: RenderTerritoryMapOptions
): Promise<Buffer> {
  ensureCanvasFontRegistered();
  const [baseMap, assets] = await Promise.all([
    loadBaseMapImage(),
    loadCanvasIconAssets()
  ]);
  const outputHeight = Math.round(
    baseMap.height * (OUTPUT_MAP_WIDTH / baseMap.width)
  );
  const { outputWidth, projectX, projectY } = createProjectors(
    OUTPUT_MAP_WIDTH,
    outputHeight
  );
  const projectedTerritories = projectTerritories(territories, projectX, projectY);
  const canvas = createCanvas(outputWidth, outputHeight);
  const ctx = canvas.getContext("2d");

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(baseMap, 0, 0, outputWidth, outputHeight);

  const territoryByName = new Map(
    projectedTerritories.map((entry) => [entry.territory.territoryName, entry] as const)
  );
  const renderedLinks = new Set<string>();

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.globalAlpha = LINK_STROKE_OPACITY;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  for (const entry of projectedTerritories) {
    for (const linkedTerritoryName of entry.territory.links) {
      const key = [entry.territory.territoryName, linkedTerritoryName]
        .sort((left, right) => left.localeCompare(right))
        .join("::");

      if (renderedLinks.has(key)) {
        continue;
      }

      renderedLinks.add(key);
      const linked = territoryByName.get(linkedTerritoryName);

      if (!linked) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(entry.centerX, entry.centerY);
      ctx.lineTo(linked.centerX, linked.centerY);
      ctx.stroke();
    }
  }
  ctx.restore();

  for (const { territory, bounds, centerX, centerY } of projectedTerritories) {
    const colors = getGuildColor(
      territory.guildName || territory.guildPrefix,
      territory.guildColor ?? options.guildColors?.get(territory.guildPrefix)
    );
    const isHq =
      territory.isHq ||
      territory.hqTerritoryName?.toLowerCase() ===
        territory.territoryName.toLowerCase();

    ctx.save();
    drawRoundedRect(
      ctx,
      bounds.left,
      bounds.top,
      Math.max(bounds.width, 2),
      Math.max(bounds.height, 2),
      2
    );
    ctx.fillStyle = colors.hex;
    ctx.globalAlpha = TERRITORY_FILL_OPACITY;
    ctx.fill();
    ctx.strokeStyle = colors.hex;
    ctx.globalAlpha = TERRITORY_STROKE_OPACITY;
    ctx.lineWidth = isHq ? 2.6 : 1.8;
    ctx.stroke();
    ctx.restore();

    if (bounds.width < 18 || bounds.height < 14) {
      continue;
    }

    const prefix = territory.guildPrefix.trim() || "NONE";
    const resourceTypes = RESOURCE_ICON_ORDER.filter((resourceType) =>
      territoryHasResource(territory, resourceType)
    );
    const showHqIcon = isHq && bounds.width >= 24 && bounds.height >= 30;
    const showResourceIcons =
      resourceTypes.length > 0 && bounds.width >= 28 && bounds.height >= 34;
    const maxLabelWidth = Math.max(16, bounds.width - 6);
    const fontSize = fitCanvasFontSize(
      ctx,
      prefix,
      maxLabelWidth,
      clamp(Math.floor(Math.min(bounds.height * 0.36, bounds.width * 0.28)), 10, 24),
      8
    );
    const prefixHeight = Math.max(12, Math.round(fontSize * 1.12));
    const hqIconSize = showHqIcon
      ? clamp(Math.floor(fontSize * 1.35), 16, 28)
      : 0;
    const resourceIconSize = showResourceIcons
      ? clamp(
          Math.min(
            Math.floor(fontSize * 0.88),
            Math.floor(
              (bounds.width - ((resourceTypes.length - 1) * 3) - 4) /
                Math.max(resourceTypes.length, 1)
            )
          ),
          8,
          16
        )
      : 0;
    const hqRowHeight = showHqIcon ? hqIconSize + 2 : 0;
    const resourceRowHeight = showResourceIcons ? resourceIconSize + 3 : 0;
    const blockHeight = hqRowHeight + prefixHeight + resourceRowHeight;
    const blockTop = Math.round(
      showHqIcon || showResourceIcons
        ? bounds.top + Math.max(1, (bounds.height - blockHeight) / 2)
        : centerY - (prefixHeight / 2)
    );

    if (showHqIcon) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        assets.hqIcon,
        Math.round(centerX - (hqIconSize / 2)),
        blockTop,
        hqIconSize,
        hqIconSize
      );
      ctx.restore();
    }

    drawCanvasTextWithShadow(
      ctx,
      prefix,
      centerX,
      showHqIcon || showResourceIcons ? blockTop + hqRowHeight : centerY,
      {
        fontSize,
        fill: colors.hex,
        opacity: PREFIX_TEXT_OPACITY,
        textAlign: "center",
        textBaseline: showHqIcon || showResourceIcons ? "top" : "middle",
        shadowOffset: 2,
        maxWidth: maxLabelWidth
      }
    );

    if (showResourceIcons) {
      const totalWidth =
        (resourceTypes.length * resourceIconSize) + ((resourceTypes.length - 1) * 3);
      let nextLeft = Math.round(centerX - (totalWidth / 2));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const resourceType of resourceTypes) {
        ctx.drawImage(
          assets.resourceIcons[resourceType],
          nextLeft,
          blockTop + hqRowHeight + prefixHeight + 2,
          resourceIconSize,
          resourceIconSize
        );
        nextLeft += resourceIconSize + 3;
      }
      ctx.restore();
    }
  }

  if (options.showChrome ?? !options.cropToTerritories) {
    drawMapChrome(ctx, snapshot, territories.length);
  }

  let outputCanvas: Canvas = canvas;

  if (options.cropToTerritories) {
    const projectedBounds = projectedTerritories.map((entry) => entry.bounds);
    const left = Math.max(
      0,
      Math.floor(Math.min(...projectedBounds.map((bounds) => bounds.left)) - GUILD_FOCUS_CROP_PADDING)
    );
    const top = Math.max(
      0,
      Math.floor(Math.min(...projectedBounds.map((bounds) => bounds.top)) - GUILD_FOCUS_CROP_PADDING)
    );
    const right = Math.min(
      outputWidth,
      Math.ceil(Math.max(...projectedBounds.map((bounds) => bounds.right)) + GUILD_FOCUS_CROP_PADDING)
    );
    const bottom = Math.min(
      outputHeight,
      Math.ceil(Math.max(...projectedBounds.map((bounds) => bounds.bottom)) + GUILD_FOCUS_CROP_PADDING)
    );
    const cropCanvas = createCanvas(Math.max(1, right - left), Math.max(1, bottom - top));
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawCanvas(
      canvas,
      left,
      top,
      Math.max(1, right - left),
      Math.max(1, bottom - top),
      0,
      0,
      Math.max(1, right - left),
      Math.max(1, bottom - top)
    );
    outputCanvas = cropCanvas;
  }

  return outputCanvas.encode("jpeg", 82);
}

function expandCropAxis(args: {
  min: number;
  max: number;
  canvasSize: number;
  minimumSize: number;
  center: number;
}): { min: number; max: number } {
  let nextMin = args.min;
  let nextMax = args.max;
  const currentSize = nextMax - nextMin;

  if (currentSize >= args.minimumSize) {
    return { min: nextMin, max: nextMax };
  }

  const half = args.minimumSize / 2;
  nextMin = Math.floor(args.center - half);
  nextMax = Math.ceil(args.center + half);

  if (nextMin < 0) {
    nextMax = Math.min(args.canvasSize, nextMax - nextMin);
    nextMin = 0;
  }

  if (nextMax > args.canvasSize) {
    const overshoot = nextMax - args.canvasSize;
    nextMin = Math.max(0, nextMin - overshoot);
    nextMax = args.canvasSize;
  }

  return { min: nextMin, max: nextMax };
}

function scaleCanvasToFit(
  source: Canvas,
  maxWidth: number,
  maxHeight: number
): Canvas {
  const scale = Math.min(
    1,
    maxWidth / source.width,
    maxHeight / source.height
  );

  if (scale >= 0.999) {
    return source;
  }

  const outputWidth = Math.max(1, Math.round(source.width * scale));
  const outputHeight = Math.max(1, Math.round(source.height * scale));
  const scaled = createCanvas(outputWidth, outputHeight);
  const ctx = scaled.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, outputWidth, outputHeight);
  return scaled;
}

export async function renderTerritoryNeighborhoodMap(
  snapshot: TerritoryMapSnapshot,
  territories: TerritoryState[],
  focusTerritoryName: string,
  options: RenderTerritoryNeighborhoodMapOptions = {}
): Promise<AttachmentBuilder> {
  const renderableTerritories = territories.filter((territory) =>
    territory.startX !== null &&
    territory.endX !== null &&
    territory.startZ !== null &&
    territory.endZ !== null
  );

  if (renderableTerritories.length === 0) {
    throw new Error("No territory coordinates are available for territory neighborhood rendering.");
  }

  ensureCanvasFontRegistered();
  const [baseMap, assets] = await Promise.all([
    loadBaseMapImage(),
    loadCanvasIconAssets()
  ]);
  const outputHeight = Math.round(
    baseMap.height * (TERRITORY_NEIGHBORHOOD_RENDER_WIDTH / baseMap.width)
  );
  const { outputWidth, projectX, projectY } = createProjectors(
    TERRITORY_NEIGHBORHOOD_RENDER_WIDTH,
    outputHeight
  );
  const allProjectedTerritories = projectTerritories(renderableTerritories, projectX, projectY);
  const focus = allProjectedTerritories.find(
    (entry) => entry.territory.territoryName.toLowerCase() === focusTerritoryName.toLowerCase()
  );

  if (!focus) {
    throw new Error(`Unknown focus territory: ${focusTerritoryName}`);
  }

  const sourceCropWidth =
    TERRITORY_NEIGHBORHOOD_OUTPUT_WIDTH * TERRITORY_NEIGHBORHOOD_OVERSCAN_SCALE;
  const sourceCropHeight =
    TERRITORY_NEIGHBORHOOD_OUTPUT_HEIGHT * TERRITORY_NEIGHBORHOOD_OVERSCAN_SCALE;
  let windowLeft = Math.floor(focus.centerX - (sourceCropWidth / 2));
  let windowTop = Math.floor(focus.centerY - (sourceCropHeight / 2));
  let windowRight = Math.ceil(focus.centerX + (sourceCropWidth / 2));
  let windowBottom = Math.ceil(focus.centerY + (sourceCropHeight / 2));

  ({ min: windowLeft, max: windowRight } = expandCropAxis({
    min: windowLeft,
    max: windowRight,
    canvasSize: outputWidth,
    minimumSize: sourceCropWidth,
    center: focus.centerX
  }));
  ({ min: windowTop, max: windowBottom } = expandCropAxis({
    min: windowTop,
    max: windowBottom,
    canvasSize: outputHeight,
    minimumSize: sourceCropHeight,
    center: focus.centerY
  }));

  const renderWindow: PixelWindow = {
    left: windowLeft,
    top: windowTop,
    right: windowRight,
    bottom: windowBottom,
    width: Math.max(1, windowRight - windowLeft),
    height: Math.max(1, windowBottom - windowTop)
  };
  const projectedTerritories = allProjectedTerritories
    .filter((entry) => boundsIntersectWindow(entry.bounds, renderWindow))
    .map((entry) => ({
      territory: entry.territory,
      bounds: {
        left: entry.bounds.left - renderWindow.left,
        top: entry.bounds.top - renderWindow.top,
        right: entry.bounds.right - renderWindow.left,
        bottom: entry.bounds.bottom - renderWindow.top,
        width: entry.bounds.width,
        height: entry.bounds.height
      },
      centerX: entry.centerX - renderWindow.left,
      centerY: entry.centerY - renderWindow.top
    }));

  const referenceDate = snapshot.territoryLastTick ?? snapshot.takenAt;
  const canvas = createCanvas(renderWindow.width, renderWindow.height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  const sourceScaleX = baseMap.width / outputWidth;
  const sourceScaleY = baseMap.height / outputHeight;
  const sourceLeft = renderWindow.left * sourceScaleX;
  const sourceTop = renderWindow.top * sourceScaleY;
  const sourceWidth = renderWindow.width * sourceScaleX;
  const sourceHeight = renderWindow.height * sourceScaleY;
  ctx.drawImage(
    baseMap,
    sourceLeft,
    sourceTop,
    sourceWidth,
    sourceHeight,
    0,
    0,
    renderWindow.width,
    renderWindow.height
  );

  const territoryByName = new Map(
    projectedTerritories.map((entry) => [entry.territory.territoryName, entry] as const)
  );
  const renderedLinks = new Set<string>();

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.globalAlpha = LINK_STROKE_OPACITY;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const entry of projectedTerritories) {
    for (const linkedTerritoryName of entry.territory.links) {
      const key = [entry.territory.territoryName, linkedTerritoryName]
        .sort((left, right) => left.localeCompare(right))
        .join("::");

      if (renderedLinks.has(key)) {
        continue;
      }

      renderedLinks.add(key);
      const linked = territoryByName.get(linkedTerritoryName);

      if (!linked) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(entry.centerX, entry.centerY);
      ctx.lineTo(linked.centerX, linked.centerY);
      ctx.stroke();
    }
  }
  ctx.restore();

  for (const { territory, bounds, centerX, centerY } of projectedTerritories) {
    const colors = getGuildColor(
      territory.guildName || territory.guildPrefix,
      territory.guildColor ?? options.guildColors?.get(territory.guildPrefix)
    );
    const isFocus = territory.territoryName.toLowerCase() === focusTerritoryName.toLowerCase();
    const isHq =
      territory.isHq ||
      territory.hqTerritoryName?.toLowerCase() === territory.territoryName.toLowerCase();

    ctx.save();
    drawRoundedRect(
      ctx,
      bounds.left,
      bounds.top,
      Math.max(bounds.width, 2),
      Math.max(bounds.height, 2),
      2
    );
    ctx.fillStyle = colors.hex;
    ctx.globalAlpha = TERRITORY_FILL_OPACITY;
    ctx.fill();
    ctx.strokeStyle = colors.hex;
    ctx.globalAlpha = TERRITORY_STROKE_OPACITY;
    ctx.lineWidth = isHq ? 2.8 : 2;
    ctx.stroke();

    if (isFocus) {
      drawRoundedRect(
        ctx,
        bounds.left - 2,
        bounds.top - 2,
        Math.max(bounds.width + 4, 4),
        Math.max(bounds.height + 4, 4),
        3
      );
      ctx.strokeStyle = "#f5f8f6";
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();

    if (bounds.width < 20 || bounds.height < 18) {
      continue;
    }

    const prefix = territory.guildPrefix.trim() || "???";
    const heldText = formatHeldDurationNeighborhood(territory.acquiredAt ?? null, referenceDate) ?? "--";
    const maxLabelWidth = Math.max(18, bounds.width - 8);
    const prefixFontSize = fitCanvasFontSize(
      ctx,
      prefix,
      maxLabelWidth,
      clamp(Math.floor(Math.min(bounds.height * 0.32, bounds.width * 0.26)), 10, 22),
      8
    );
    const heldFontSize = clamp(Math.floor(prefixFontSize * 0.72), 7, 14);
    const prefixHeight = Math.max(11, Math.round(prefixFontSize * 1.1));
    const heldHeight = Math.max(9, Math.round(heldFontSize * 1.08));
    const showHqIcon = isHq && bounds.width >= 24 && bounds.height >= 30;
    const hqIconSize = showHqIcon
      ? clamp(Math.floor(prefixFontSize * 1.25), 15, 24)
      : 0;
    const hqHeight = showHqIcon ? hqIconSize + 2 : 0;
    const blockHeight = hqHeight + prefixHeight + heldHeight;
    const blockTop = Math.round(
      bounds.top + Math.max(1, (bounds.height - blockHeight) / 2)
    );

    if (showHqIcon) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        assets.hqIcon,
        Math.round(centerX - (hqIconSize / 2)),
        blockTop,
        hqIconSize,
        hqIconSize
      );
      ctx.restore();
    }

    drawCanvasTextWithShadow(ctx, prefix, centerX, blockTop + hqHeight, {
      fontSize: prefixFontSize,
      fill: colors.hex,
      opacity: PREFIX_TEXT_OPACITY,
      textAlign: "center",
      textBaseline: "top",
      shadowOffset: 2,
      maxWidth: maxLabelWidth
    });

    drawCanvasTextWithShadow(ctx, heldText, centerX, blockTop + hqHeight + prefixHeight, {
      fontSize: heldFontSize,
      fill: "#f2f5f3",
      opacity: HOLD_TIME_TEXT_OPACITY,
      textAlign: "center",
      textBaseline: "top",
      shadowOffset: 1,
      maxWidth: maxLabelWidth
    });
  }

  const outputLeft = Math.max(
    0,
    Math.floor((renderWindow.width - TERRITORY_NEIGHBORHOOD_OUTPUT_WIDTH) / 2)
  );
  const outputTop = Math.max(
    0,
    Math.floor((renderWindow.height - TERRITORY_NEIGHBORHOOD_OUTPUT_HEIGHT) / 2)
  );
  const outputCanvas = createCanvas(
    TERRITORY_NEIGHBORHOOD_OUTPUT_WIDTH,
    TERRITORY_NEIGHBORHOOD_OUTPUT_HEIGHT
  );
  const outputCtx = outputCanvas.getContext("2d");
  outputCtx.drawCanvas(
    canvas,
    outputLeft,
    outputTop,
    TERRITORY_NEIGHBORHOOD_OUTPUT_WIDTH,
    TERRITORY_NEIGHBORHOOD_OUTPUT_HEIGHT,
    0,
    0,
    TERRITORY_NEIGHBORHOOD_OUTPUT_WIDTH,
    TERRITORY_NEIGHBORHOOD_OUTPUT_HEIGHT
  );

  return new AttachmentBuilder(await outputCanvas.encode("jpeg", 88), {
    name: TERRITORY_NEIGHBORHOOD_MAP_FILENAME
  });
}

function createProjectors(
  outputWidth = OUTPUT_MAP_WIDTH,
  outputHeight = Math.round(
    SOURCE_MAP_BOUNDS.height * (outputWidth / SOURCE_MAP_BOUNDS.width)
  )
): {
  outputWidth: number;
  outputHeight: number;
  projectX: (value: number) => number;
  projectY: (value: number) => number;
} {
  const worldWidth = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
  const worldHeight = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
  const scale = outputWidth / OUTPUT_MAP_WIDTH;
  const scaledMapLeft = MAP_LEFT * scale;
  const scaledMapTop = MAP_TOP * scale;
  const scaledMapWidth = MAP_WIDTH * scale;
  const scaledMapHeight = MAP_HEIGHT * scale;

  return {
    outputWidth,
    outputHeight,
    projectX: (value: number): number =>
      scaledMapLeft + (((value - WORLD_BOUNDS.minX) / worldWidth) * scaledMapWidth),
    projectY: (value: number): number =>
      scaledMapTop + (((value - WORLD_BOUNDS.minZ) / worldHeight) * scaledMapHeight)
  };
}

export function getTerritoryMapSimulatorDefaults(): TerritoryMapSimulatorDefaults {
  const sourceWidth = SOURCE_MAP_BOUNDS.width;
  const sourceHeight = SOURCE_MAP_BOUNDS.height;
  const scale = OUTPUT_MAP_WIDTH / sourceWidth;
  const outputHeight = Math.round(sourceHeight * scale);

  return {
    outputWidth: OUTPUT_MAP_WIDTH,
    outputHeight,
    sourceWidth,
    sourceHeight,
    mapLeft: MAP_LEFT,
    mapTop: MAP_TOP,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    worldBounds: {
      minX: WORLD_BOUNDS.minX,
      maxX: WORLD_BOUNDS.maxX,
      minZ: WORLD_BOUNDS.minZ,
      maxZ: WORLD_BOUNDS.maxZ
    }
  };
}

export function buildTerritoryMapVisualSignature(
  snapshot: TerritoryMapSnapshot
): string {
  return snapshot.territories
    .filter((territory) =>
      territory.startX !== null &&
      territory.endX !== null &&
      territory.startZ !== null &&
      territory.endZ !== null
    )
    .map((territory) => {
      const resourceFlags = RESOURCE_ICON_ORDER
        .filter((resourceType) => territoryHasResource(territory, resourceType))
        .join(",");

      return [
        territory.territoryName,
        territory.guildName,
        territory.guildPrefix,
        territory.guildColor ?? "",
        territory.hqTerritoryName ?? "",
        territory.isHq ? "1" : "0",
        territory.startX,
        territory.startZ,
        territory.endX,
        territory.endZ,
        resourceFlags,
        territory.links.join(",")
      ].join("|");
    })
    .join("\n");
}

export function buildTerritoryMapSummary(snapshot: TerritoryMapSnapshot): string {
  const effectiveTimestamp = snapshot.territoryLastTick ?? snapshot.takenAt;

  if (snapshot.source === "live") {
    return `ETKWynn /map from live Wynncraft data. Tick: ${formatUtcTimestamp(effectiveTimestamp)}.`;
  }

  return `ETKWynn /map from stored snapshot fallback. Snapshot: ${formatUtcTimestamp(effectiveTimestamp)}.`;
}

export async function getPregeneratedDefaultTerritoryMap(
  snapshot: TerritoryMapSnapshot,
  guildColors?: ReadonlyMap<string, string>
): Promise<AttachmentBuilder> {
  const signature = buildTerritoryMapVisualSignature(snapshot);

  if (pregeneratedDefaultMapSignature === signature && pregeneratedDefaultMapBuffer) {
    return new AttachmentBuilder(pregeneratedDefaultMapBuffer, {
      name: MAP_OUTPUT_FILENAME
    });
  }

  const attachment = await renderTerritoryMap(snapshot, {
    showChrome: true,
    cropToTerritories: false,
    guildColors,
    cacheKeySuffix: `pregenerated:${signature}`
  });
  const rendered = attachment.attachment;

  if (Buffer.isBuffer(rendered)) {
    pregeneratedDefaultMapSignature = signature;
    pregeneratedDefaultMapBuffer = rendered;
  }

  return attachment;
}

export async function renderTerritoryMap(
  snapshot: TerritoryMapSnapshot,
  options: RenderTerritoryMapOptions = {}
): Promise<AttachmentBuilder> {
  const territories = snapshot.territories.filter((territory) =>
    territory.startX !== null &&
    territory.endX !== null &&
    territory.startZ !== null &&
    territory.endZ !== null
  );

  if (territories.length === 0) {
    throw new Error("No territory coordinates are available for map rendering.");
  }

  const renderKey = [
    snapshot.source,
    (snapshot.territoryLastTick ?? snapshot.takenAt).toISOString(),
    territories.length,
    options.cropToTerritories ? "crop" : "full",
    options.showChrome === false ? "plain" : "chrome",
    options.cacheKeySuffix ?? ""
  ].join(":");

  if (cachedRenderKey === renderKey && cachedRenderBuffer) {
    return new AttachmentBuilder(cachedRenderBuffer, {
      name: MAP_OUTPUT_FILENAME
    });
  }

  const buffer = await renderTerritoryMapCanvasBuffer(snapshot, territories, options);
  cachedRenderKey = renderKey;
  cachedRenderBuffer = buffer;

  return new AttachmentBuilder(buffer, {
    name: MAP_OUTPUT_FILENAME
  });
}
