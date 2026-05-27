import { readFileSync } from "node:fs";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import sharp from "sharp";
import {
  fetchWithWynncraftAuthFallback
} from "./wynncraft.js";
import { logInfo, logWarning } from "./core/logging.js";
import { resolvePreferredFontPathFromUrl } from "./fontPath.js";
import {
  formatDateForTimeZone,
  formatDateTimeForTimeZone
} from "./features/timezone/runtime.js";

const WYNNCRAFT_PLAYER_URL = "https://api.wynncraft.com/v3/player";
const WYNNCRAFT_GUILD_PREFIX_URL = "https://api.wynncraft.com/v3/guild/prefix";
const IDENTICRAFT_BUST_RENDER_URL = "https://identicraft.js.org/bust";
const BANNER_RENDER_URL = "https://banner.weikuwu.me/api/bannerCreate";
const PLAYER_CARD_FILENAME = "player-card.png";
const MAIN_PROFILE_VIEW = "main-profile";
const PLAYER_CARD_TEXT_COLOR = "#071018";
const PLAYER_CARD_BACKGROUND_BUFFER = readFileSync(
  new URL("../public/img/player-background.jpeg", import.meta.url)
);
const PLAYER_CARD_FONT_PATH = resolvePreferredFontPathFromUrl(
  new URL("../public/fonts/mojangles.otf", import.meta.url)
);
const PLAYER_CARD_FONT_FAMILY = "Mojangles";
const PLAYER_EMBED_COLORS = {
  online: 0x00ff99,
  offline: 0xff5555
} as const;
const GUILD_BANNER_PATTERN_MAP = {
  BASE: "base",
  BORDER: "border",
  BRICKS: "bricks",
  CIRCLE: "circle",
  CIRCLE_MIDDLE: "circle",
  CREEPER: "creeper",
  CROSS: "cross",
  CURLY_BORDER: "curly_border",
  DIAGONAL_LEFT: "diagonal_left",
  DIAGONAL_RIGHT: "diagonal_right",
  DIAGONAL_UP_LEFT: "diagonal_up_left",
  DIAGONAL_LEFT_MIRROR: "diagonal_up_left",
  DIAGONAL_UP_RIGHT: "diagonal_up_right",
  DIAGONAL_RIGHT_MIRROR: "diagonal_up_right",
  FLOWER: "flower",
  GLOBE: "globe",
  GRADIENT: "gradient",
  GRADIENT_UP: "gradient_up",
  HALF_HORIZONTAL: "half_horizontal",
  HALF_HORIZONTAL_BOTTOM: "half_horizontal_bottom",
  HALF_HORIZONTAL_MIRROR: "half_horizontal_bottom",
  HALF_VERTICAL: "half_vertical",
  HALF_VERTICAL_RIGHT: "half_vertical_right",
  HALF_VERTICAL_MIRROR: "half_vertical_right",
  MOJANG: "mojang",
  PIGLIN: "piglin",
  RHOMBUS: "rhombus",
  RHOMBUS_MIDDLE: "rhombus",
  SKULL: "skull",
  SMALL_STRIPES: "small_stripes",
  STRIPE_SMALL: "small_stripes",
  SQUARE_BOTTOM_LEFT: "square_bottom_left",
  SQUARE_BOTTOM_RIGHT: "square_bottom_right",
  SQUARE_TOP_LEFT: "square_top_left",
  SQUARE_TOP_RIGHT: "square_top_right",
  STRAIGHT_CROSS: "straight_cross",
  STRIPE_BOTTOM: "stripe_bottom",
  STRIPE_CENTER: "stripe_center",
  STRIPE_DOWNLEFT: "stripe_downleft",
  STRIPE_DOWNRIGHT: "stripe_downright",
  STRIPE_LEFT: "stripe_left",
  STRIPE_MIDDLE: "stripe_middle",
  STRIPE_RIGHT: "stripe_right",
  STRIPE_TOP: "stripe_top",
  TRIANGLE_BOTTOM: "triangle_bottom",
  TRIANGLE_TOP: "triangle_top",
  TRIANGLES_BOTTOM: "triangles_bottom",
  TRIANGLES_TOP: "triangles_top"
} as const;
const textWidthCache = new Map<string, number>();

function formatDiscordName(value: string): string {
  return `\`${value.replace(/`/g, "'").replace(/\s+/g, " ").trim()}\``;
}

const RAID_NAME_TO_LABEL = {
  "Nest of the Grootslangs": "NOTG",
  "Orphion's Nexus of Light": "NOL",
  "The Canyon Colossus": "TCC",
  "The Nameless Anomaly": "TNA",
  "The Wartorn Palace": "TWP"
} as const;
const CLASS_NAMES = {
  SHAMAN: "Shaman",
  MAGE: "Mage",
  ASSASSIN: "Assassin",
  ARCHER: "Archer",
  WARRIOR: "Warrior"
} as const;
const RESKIN_NAMES = {
  SKYSEER: "Skyseer",
  DARKWIZARD: "Dark Wizard",
  KNIGHT: "Knight",
  NINJA: "Ninja",
  HUNTER: "Hunter"
} as const;
const CLASS_SHORT_NAMES = {
  SHAMAN: "Sh",
  MAGE: "Ma",
  ASSASSIN: "As",
  ARCHER: "Ar",
  WARRIOR: "Wa"
} as const;
const RESKIN_SHORT_NAMES = {
  SKYSEER: "Sk",
  DARKWIZARD: "Da",
  KNIGHT: "Kn",
  NINJA: "Ni",
  HUNTER: "Hu"
} as const;
const PROFESSIONS_BY_ROW = [
  ["fishing", "Fishing"],
  ["woodcutting", "Woodcutting"],
  ["mining", "Mining"],
  ["farming", "Farming"]
] as const;
const CRAFTING_PROFESSIONS = [
  ["jeweling", "Jeweling"],
  ["weaponsmithing", "Weaponsmithing"],
  ["tailoring", "Tailoring"],
  ["woodworking", "Woodworking"],
  ["armouring", "Armoring"]
] as const;
const SUPPORT_PROFESSIONS = [
  ["scribing", "Scribing"],
  ["alchemism", "Alchemism"],
  ["cooking", "Cooking"]
] as const;

type WynncraftRaidList = Partial<Record<keyof typeof RAID_NAME_TO_LABEL, number | null>>;

type WynncraftCounter = {
  total?: number | null;
  list?: WynncraftRaidList | Record<string, number | null> | null;
};

type WynncraftProfession = {
  level?: number | null;
  xpPercent?: number | null;
};

type WynncraftCharacter = {
  type?: string | null;
  reskin?: string | null;
  nickname?: string | null;
  level?: number | null;
  totalLevel?: number | null;
  wars?: number | null;
  playtime?: number | null;
  mobsKilled?: number | null;
  killedMobs?: number | null;
  chestsFound?: number | null;
  dungeons?: WynncraftCounter | null;
  raids?: WynncraftCounter | null;
  worldEvents?: number | null;
  lootruns?: number | null;
  blocksWalked?: number | null;
  gamemode?: string[] | null;
  pvp?: {
    kills?: number | null;
    deaths?: number | null;
  } | null;
  quests?: string[] | null;
  professions?: Record<string, WynncraftProfession | null> | null;
};

type WynncraftPlayerResponse = {
  username: string;
  online?: boolean | null;
  server?: string | null;
  activeCharacter?: string | null;
  uuid?: string;
  rank?: string | null;
  shortenedRank?: string | null;
  supportRank?: string | null;
  veteran?: boolean | null;
  firstJoin?: string | null;
  lastJoin?: string | null;
  playtime?: number | null;
  guild?: {
    uuid?: string | null;
    name?: string | null;
    prefix?: string | null;
    rank?: string | null;
    rankStars?: string | null;
  } | null;
  ranking?: Record<string, number | null> | null;
  globalData?: {
    wars?: number | null;
    totalLevel?: number | null;
    totalLevels?: number | null;
    mobsKilled?: number | null;
    killedMobs?: number | null;
    chestsFound?: number | null;
    dungeons?: WynncraftCounter | null;
    raids?: WynncraftCounter | null;
    guildRaids?: WynncraftCounter | null;
    worldEvents?: number | null;
    lootruns?: number | null;
    completedQuests?: number | null;
    pvp?: {
      kills?: number | null;
      deaths?: number | null;
    } | null;
  } | null;
  characters?: Record<string, WynncraftCharacter | null> | null;
};

type WynncraftGuildResponse = {
  name?: string | null;
  prefix?: string | null;
  banner?: {
    base?: string | null;
    layers?:
      | Array<{
          colour?: string | null;
          pattern?: string | null;
        } | null>
      | null;
  } | null;
  members?:
    | Record<
        string,
        | Record<
            string,
            {
              uuid?: string | null;
              joined?: string | null;
            } | null
          >
        | null
      >
    | null;
};

type PlayerCardRectLayer = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  fill: string;
  opacity?: number;
};

type PlayerCardTextLayer = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  anchor?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  opacity?: number;
};

export type PublicPlayerRaidProfile = {
  uuid: string;
  username: string;
  online: boolean;
  wars: number;
  total: number;
  notg: number;
  nol: number;
  tcc: number;
  tna: number;
  twp: number;
};

export type PublicPlayerGuildStatus = {
  username: string;
  server: string | null;
  guildRank: string | null;
};

export type PublicTerritoryHolderProfile = {
  username: string;
  server: string | null;
  guildRank: string | null;
  activeClassName: string | null;
  activeClassLevel: number | null;
  wars: number;
};

export type PublicActiveCharacterProfile = {
  username: string;
  server: string | null;
  activeClassShortName: string | null;
  activeClassLevel: number | null;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value);
}

function formatHours(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDisplayRank(player: WynncraftPlayerResponse): string {
  if (player.supportRank) {
    return player.supportRank;
  }

  if (player.shortenedRank) {
    return player.shortenedRank;
  }

  if (player.veteran) {
    return "Veteran";
  }

  return player.rank ?? "Player";
}

function formatFirstJoin(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function formatDiscordTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function getRaidCount(
  counter: WynncraftCounter | null | undefined,
  raidName: keyof typeof RAID_NAME_TO_LABEL
): number {
  const value = counter?.list?.[raidName];
  return typeof value === "number" ? value : 0;
}

function formatGuildLine(player: WynncraftPlayerResponse): string {
  if (!player.guild?.rank || (!player.guild.prefix && !player.guild.name)) {
    return "No guild";
  }

  return `${toTitleCase(player.guild.rank)} of ${player.guild.prefix ?? player.guild.name}`;
}

function formatStatusLine(player: WynncraftPlayerResponse): string {
  if (player.online) {
    return player.server ? `\u{1F7E9}Online on ${player.server}` : "\u{1F7E9}Online";
  }

  const timestamp = formatDiscordTimestamp(player.lastJoin);

  if (player.server && timestamp) {
    return `\u{1F7E5}Offline (Last seen: ${player.server} at ${timestamp})`;
  }

  if (timestamp) {
    return `\u{1F7E5}Offline (Last seen: ${timestamp})`;
  }

  return "\u{1F7E5}Offline";
}

function getCharacterName(character: WynncraftCharacter): string {
  if (character.nickname) {
    return character.nickname;
  }

  const className = character.type ? CLASS_NAMES[character.type as keyof typeof CLASS_NAMES] : null;
  return className ?? "Character";
}

function getCharacterShortLabel(character: WynncraftCharacter): string {
  if (!character.type) {
    return "Ch";
  }

  return CLASS_SHORT_NAMES[character.type as keyof typeof CLASS_SHORT_NAMES] ?? character.type.slice(0, 2);
}

function getCharacterShortCode(character: WynncraftCharacter | null | undefined): string | null {
  if (!character) {
    return null;
  }

  if (character.reskin) {
    const shortReskin =
      RESKIN_SHORT_NAMES[character.reskin as keyof typeof RESKIN_SHORT_NAMES];

    if (shortReskin) {
      return shortReskin;
    }
  }

  if (!character.type) {
    return null;
  }

  return (
    CLASS_SHORT_NAMES[character.type as keyof typeof CLASS_SHORT_NAMES] ??
    character.type.slice(0, 2)
  );
}

function getMetricValue(value: number | null | undefined): number {
  return typeof value === "number" ? value : 0;
}

function formatProfessionRow(
  professions: Record<string, WynncraftProfession | null> | null | undefined,
  row: ReadonlyArray<readonly [string, string]>
): string {
  return row
    .map(([key, label]) => `${label} ${getMetricValue(professions?.[key]?.level)}`)
    .join(" - ");
}

function buildSummaryCharacterLine(characters: WynncraftCharacter[]): string {
  if (characters.length === 0) {
    return "Characters: None";
  }

  return `Characters: ${characters
    .map((character) => `${getCharacterShortLabel(character)} ${getMetricValue(character.level)}`)
    .join(", ")}`;
}

function buildSummaryEmbed(
  player: WynncraftPlayerResponse,
  characters: WynncraftCharacter[],
  totalPages: number
): EmbedBuilder {
  const globalData = player.globalData;
  const raids = globalData?.raids;
  const totalRaids = getMetricValue(raids?.total);
  const lines = [
    formatGuildLine(player),
    formatStatusLine(player),
    `First join: ${formatFirstJoin(player.firstJoin)} - ${formatHours(getMetricValue(player.playtime))}h playtime`,
    `Total Level: ${formatNumber(
      getMetricValue(globalData?.totalLevel ?? globalData?.totalLevels)
    )} - ${formatNumber(
      getMetricValue(globalData?.mobsKilled ?? globalData?.killedMobs)
    )} Mobs Killed - ${formatNumber(getMetricValue(globalData?.chestsFound))} Chests Opened`,
    `${formatNumber(getMetricValue(globalData?.dungeons?.total))} Dungeons - ${formatNumber(
      getMetricValue(globalData?.wars)
    )} Wars - ${formatNumber(getMetricValue(globalData?.worldEvents))} World Events - ${formatNumber(
      getMetricValue(globalData?.lootruns)
    )} Lootruns - ${formatNumber(getMetricValue(globalData?.completedQuests))} Quests`,
    `${formatNumber(totalRaids)} Raids: ${formatNumber(
      getRaidCount(raids, "Nest of the Grootslangs")
    )} NOTG, ${formatNumber(
      getRaidCount(raids, "Orphion's Nexus of Light")
    )} NOL, ${formatNumber(getRaidCount(raids, "The Canyon Colossus"))} TCC, ${formatNumber(
      getRaidCount(raids, "The Nameless Anomaly")
    )} TNA, ${formatNumber(getRaidCount(raids, "The Wartorn Palace"))} TWP`,
    buildSummaryCharacterLine(characters)
  ];

  return new EmbedBuilder()
    .setTitle(`(${getDisplayRank(player)}) ${formatDiscordName(player.username)}`)
    .setColor(player.online ? PLAYER_EMBED_COLORS.online : PLAYER_EMBED_COLORS.offline)
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: `Page 1/${totalPages}`
    });
}

function buildCharacterEmbed(
  player: WynncraftPlayerResponse,
  character: WynncraftCharacter,
  pageIndex: number,
  totalPages: number
): EmbedBuilder {
  const raids = character.raids;
  const lines = [
    `Total Level: ${formatNumber(getMetricValue(character.totalLevel))} - ${formatNumber(
      getMetricValue(character.mobsKilled ?? character.killedMobs)
    )} Mobs Killed - ${formatNumber(getMetricValue(character.chestsFound))} Chests Opened`,
    formatProfessionRow(character.professions, PROFESSIONS_BY_ROW),
    formatProfessionRow(character.professions, CRAFTING_PROFESSIONS),
    formatProfessionRow(character.professions, SUPPORT_PROFESSIONS),
    `${formatNumber(getMetricValue(character.dungeons?.total))} Dungeons - ${formatNumber(
      getMetricValue(character.wars)
    )} ${getMetricValue(character.wars) === 1 ? "War" : "Wars"} - ${formatNumber(
      getMetricValue(character.worldEvents)
    )} World Events - ${formatNumber(getMetricValue(character.lootruns))} Lootruns - ${formatNumber(
      character.quests?.length ?? 0
    )} Quests`,
    `${formatNumber(getMetricValue(raids?.total))} Raids: NOTG ${formatNumber(
      getRaidCount(raids, "Nest of the Grootslangs")
    )} - NOL ${formatNumber(
      getRaidCount(raids, "Orphion's Nexus of Light")
    )} - TCC ${formatNumber(getRaidCount(raids, "The Canyon Colossus"))} - TNA ${formatNumber(
      getRaidCount(raids, "The Nameless Anomaly")
    )} - TWP ${formatNumber(getRaidCount(raids, "The Wartorn Palace"))}`
  ];

  return new EmbedBuilder()
    .setTitle(
      `${getCharacterName(character)} [${getMetricValue(character.level)}] - ${formatHours(
        getMetricValue(character.playtime)
      )}h Playtime`
    )
    .setColor(player.online ? PLAYER_EMBED_COLORS.online : PLAYER_EMBED_COLORS.offline)
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: `Page ${pageIndex + 1}/${totalPages}`
    });
}

export async function fetchPlayerProfile(username: string): Promise<WynncraftPlayerResponse> {
  const response = await fetchWithWynncraftAuthFallback(
    `${WYNNCRAFT_PLAYER_URL}/${encodeURIComponent(username)}?fullResult`
  );

  if (response.status === 404) {
    throw new Error(`Player ${username} was not found.`);
  }

  if (!response.ok) {
    throw new Error(`Wynncraft API returned ${response.status}`);
  }

  const player = (await response.json()) as WynncraftPlayerResponse;

  if (!player.username) {
    throw new Error("Wynncraft returned an invalid player payload.");
  }

  return player;
}

function getCharacterDisplayName(character: WynncraftCharacter | null | undefined): string | null {
  if (!character) {
    return null;
  }

  if (character.reskin) {
    return (
      RESKIN_NAMES[character.reskin as keyof typeof RESKIN_NAMES] ?? toTitleCase(character.reskin)
    );
  }

  if (!character.type) {
    return null;
  }

  return CLASS_NAMES[character.type as keyof typeof CLASS_NAMES] ?? character.type;
}

export async function fetchPublicPlayerRaidProfile(
  usernameOrUuid: string
): Promise<PublicPlayerRaidProfile> {
  const response = await fetchWithWynncraftAuthFallback(
    `${WYNNCRAFT_PLAYER_URL}/${encodeURIComponent(usernameOrUuid)}`
  );

  if (response.status === 404) {
    throw new Error(`Player ${usernameOrUuid} was not found.`);
  }

  if (!response.ok) {
    throw new Error(`Wynncraft API returned ${response.status}`);
  }

  const player = (await response.json()) as WynncraftPlayerResponse;

  if (!player.username || !player.uuid) {
    throw new Error("Wynncraft returned an invalid player payload.");
  }

  const guildRaids = player.globalData?.guildRaids;

  return {
    uuid: player.uuid,
    username: player.username,
    online: player.online === true,
    wars: getMetricValue(player.globalData?.wars),
    total: getMetricValue(guildRaids?.total),
    notg: getRaidCount(guildRaids, "Nest of the Grootslangs"),
    nol: getRaidCount(guildRaids, "Orphion's Nexus of Light"),
    tcc: getRaidCount(guildRaids, "The Canyon Colossus"),
    tna: getRaidCount(guildRaids, "The Nameless Anomaly"),
    twp: getRaidCount(guildRaids, "The Wartorn Palace")
  };
}

export async function fetchPublicPlayerGuildStatus(
  usernameOrUuid: string
): Promise<PublicPlayerGuildStatus> {
  const response = await fetchWithWynncraftAuthFallback(
    `${WYNNCRAFT_PLAYER_URL}/${encodeURIComponent(usernameOrUuid)}`
  );

  if (response.status === 404) {
    throw new Error(`Player ${usernameOrUuid} was not found.`);
  }

  if (!response.ok) {
    throw new Error(`Wynncraft API returned ${response.status}`);
  }

  const player = (await response.json()) as WynncraftPlayerResponse;

  if (!player.username) {
    throw new Error("Wynncraft returned an invalid player payload.");
  }

  return {
    username: player.username,
    server: player.server ?? null,
    guildRank: player.guild?.rank ?? null
  };
}

export async function fetchPublicTerritoryHolderProfile(
  usernameOrUuid: string
): Promise<PublicTerritoryHolderProfile> {
  const player = await fetchPlayerProfile(usernameOrUuid);
  const activeCharacter =
    player.activeCharacter ? player.characters?.[player.activeCharacter] ?? null : null;

  return {
    username: player.username,
    server: player.server ?? null,
    guildRank: player.guild?.rank ?? null,
    activeClassName: getCharacterDisplayName(activeCharacter),
    activeClassLevel:
      typeof activeCharacter?.level === "number" ? activeCharacter.level : null,
    wars: getMetricValue(player.globalData?.wars)
  };
}

export async function fetchPublicActiveCharacterProfile(
  usernameOrUuid: string
): Promise<PublicActiveCharacterProfile> {
  const player = await fetchPlayerProfile(usernameOrUuid);
  const activeCharacter =
    player.activeCharacter ? player.characters?.[player.activeCharacter] ?? null : null;

  return {
    username: player.username,
    server: player.server ?? null,
    activeClassShortName: getCharacterShortCode(activeCharacter),
    activeClassLevel:
      typeof activeCharacter?.level === "number" ? activeCharacter.level : null
  };
}

export function buildPlayerEmbeds(player: WynncraftPlayerResponse): EmbedBuilder[] {
  const characters = Object.values(player.characters ?? {}).filter(
    (character): character is WynncraftCharacter => character !== null
  );
  const totalPages = characters.length + 1;

  return [
    buildSummaryEmbed(player, characters, totalPages),
    ...characters.map((character, index) =>
      buildCharacterEmbed(player, character, index + 1, totalPages)
    )
  ];
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

function renderRectLayer(layer: PlayerCardRectLayer): string {
  const radius = layer.radius ?? 0;

  return `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${radius}" ry="${radius}" fill="${escapeXml(layer.fill)}" opacity="${formatOpacity(layer.opacity)}" />`;
}

function buildShapeOverlaySvg(
  width: number,
  height: number,
  rectLayers: PlayerCardRectLayer[]
): Buffer {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${rectLayers.map((layer) => renderRectLayer(layer)).join("")}
</svg>`;

  return Buffer.from(svg);
}

async function applyLayerOpacity(buffer: Buffer, opacity: number | undefined): Promise<Buffer> {
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

async function renderTextBuffer(
  text: string,
  layer: PlayerCardTextLayer
): Promise<Buffer> {
  const rendered = await sharp({
    text: {
      text: `<span foreground="${escapeXml(layer.fill)}">${escapeXml(text)}</span>`,
      font: `${PLAYER_CARD_FONT_FAMILY} ${layer.fontSize}`,
      fontfile: PLAYER_CARD_FONT_PATH,
      rgba: true
    }
  })
    .png()
    .toBuffer();

  return applyLayerOpacity(rendered, layer.opacity);
}

async function measureTextWidth(text: string, fontSize: number): Promise<number> {
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
    fill: PLAYER_CARD_TEXT_COLOR
  });
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  textWidthCache.set(cacheKey, width);
  return width;
}

function getTextTop(layer: PlayerCardTextLayer, renderedHeight: number): number {
  switch (layer.verticalAlign) {
    case "middle":
      return Math.round(layer.y - renderedHeight / 2);
    case "bottom":
      return Math.round(layer.y - renderedHeight);
    default:
      return Math.round(layer.y);
  }
}

function getTextLeft(layer: PlayerCardTextLayer, renderedWidth: number): number {
  switch (layer.anchor) {
    case "center":
      return Math.round(layer.x - renderedWidth / 2);
    case "right":
      return Math.round(layer.x - renderedWidth);
    default:
      return Math.round(layer.x);
  }
}

async function buildTextComposites(
  layers: PlayerCardTextLayer[]
): Promise<sharp.OverlayOptions[]> {
  const composites: sharp.OverlayOptions[] = [];

  for (const layer of layers) {
    if (!layer.text) {
      continue;
    }

    const buffer = await renderTextBuffer(layer.text, layer);
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    composites.push({
      input: buffer,
      left: getTextLeft(layer, width),
      top: getTextTop(layer, height)
    });
  }

  return composites;
}

async function fitFontSize(
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number
): Promise<number> {
  let fontSize = initialSize;

  while (fontSize > minimumSize) {
    const width = await measureTextWidth(text, fontSize);

    if (width <= maxWidth) {
      return fontSize;
    }

    fontSize -= 2;
  }

  return minimumSize;
}

function splitUppercaseWords(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCardDate(
  value: string | null | undefined,
  timeZone?: string | null
): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return formatDateForTimeZone(date, timeZone);
}

function formatCardDateTime(
  value: string | null | undefined,
  timeZone?: string | null
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDateTimeForTimeZone(date, timeZone);
}

function formatHoursCompact(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 2
  }).format(rounded);
}

function getDisplayRankLabel(player: WynncraftPlayerResponse): string {
  return getDisplayRank(player).toUpperCase();
}

function formatGuildRankLabel(rank: string | null | undefined): string {
  if (!rank) {
    return "UNGUILDED";
  }

  return rank.toUpperCase();
}

function getActiveCharacter(player: WynncraftPlayerResponse): WynncraftCharacter | null {
  if (player.activeCharacter) {
    const active = player.characters?.[player.activeCharacter];

    if (active) {
      return active;
    }
  }

  const characters = Object.values(player.characters ?? {}).filter(
    (character): character is WynncraftCharacter => character !== null
  );

  if (characters.length === 0) {
    return null;
  }

  return (
    characters.sort(
      (left, right) => getMetricValue(right.level) - getMetricValue(left.level)
    )[0] ?? null
  );
}

function formatClassLabel(character: WynncraftCharacter | null): string {
  return (getCharacterDisplayName(character) ?? "Unknown").toUpperCase();
}

function getRankingLine(player: WynncraftPlayerResponse, key: string): string | null {
  const ranking = player.ranking?.[key];

  if (typeof ranking !== "number" || ranking >= 10000) {
    return null;
  }

  return `#${formatNumber(ranking)}`;
}

function getRaidList(counter: WynncraftCounter | null | undefined) {
  return {
    notg: getRaidCount(counter, "Nest of the Grootslangs"),
    nol: getRaidCount(counter, "Orphion's Nexus of Light"),
    tcc: getRaidCount(counter, "The Canyon Colossus"),
    tna: getRaidCount(counter, "The Nameless Anomaly"),
    twp: getRaidCount(counter, "The Wartorn Palace"),
    total: getMetricValue(counter?.total)
  };
}

function getCharacterEntries(player: WynncraftPlayerResponse) {
  return Object.entries(player.characters ?? {})
    .filter((entry) => entry[1] !== null)
    .map(([id, character]) => [id, character as WynncraftCharacter] as const)
    .sort(([leftId, left], [rightId, right]) => {
      if (leftId === player.activeCharacter) {
        return -1;
      }

      if (rightId === player.activeCharacter) {
        return 1;
      }

      return getMetricValue(right.level) - getMetricValue(left.level);
    });
}

function getSelectedCharacter(
  player: WynncraftPlayerResponse,
  selectedView: string
): { id: string; character: WynncraftCharacter } | null {
  if (selectedView === MAIN_PROFILE_VIEW) {
    return null;
  }

  const character = player.characters?.[selectedView] ?? null;

  if (!character) {
    return null;
  }

  return {
    id: selectedView,
    character
  };
}

function formatCharacterMenuLabel(character: WynncraftCharacter): string {
  const className = getCharacterDisplayName(character) ?? "Character";

  if (character.nickname) {
    return `${className}/${character.nickname}*`;
  }

  return className;
}

export type PlayerViewOption = {
  label: string;
  value: string;
};

export type PlayerViewSummary = {
  username: string;
  views: PlayerViewOption[];
};

export function buildPlayerViewSummary(player: WynncraftPlayerResponse): PlayerViewSummary {
  return {
    username: player.username,
    views: [
      {
        label: "Main Profile",
        value: MAIN_PROFILE_VIEW
      },
      ...getCharacterEntries(player).map(([id, character]) => ({
        label: `[${getMetricValue(character.level)}] ${formatCharacterMenuLabel(character)}`.slice(
          0,
          100
        ),
        value: id
      }))
    ]
  };
}

function formatCharacterHeaderText(
  player: WynncraftPlayerResponse,
  character: WynncraftCharacter
): string {
  const label = character.nickname ? `${character.nickname}*` : player.username;
  return `[${getMetricValue(character.level)}] ${label}`;
}

function normalizeWalkedBlocks(value: number | null | undefined): number {
  if (typeof value !== "number") {
    return 0;
  }

  return value < 0 ? 2 ** 32 + value : value;
}

function abbreviateNumber(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `${Math.round((value / 1_000_000_000) * 10) / 10}B`;
  }

  if (abs >= 1_000_000) {
    return `${Math.round((value / 1_000_000) * 10) / 10}M`;
  }

  if (abs >= 1_000) {
    return `${Math.round((value / 1_000) * 10) / 10}k`;
  }

  return `${Math.round(value)}`;
}

function formatProfessionProgress(
  professions: Record<string, WynncraftProfession | null> | null | undefined,
  key: string
): string {
  const level = getMetricValue(professions?.[key]?.level);
  const xpPercent = getMetricValue(professions?.[key]?.xpPercent);
  return `${formatNumber(level)} (${xpPercent}%)`;
}

function formatGamemodeLabel(gamemode: string[] | null | undefined): string {
  const modes = new Set(gamemode ?? []);
  const has = (value: string) => modes.has(value);

  if (has("hardcore") && has("ultimate_ironman") && has("craftsman") && has("hunted")) {
    return "HUICH";
  }

  if (has("hardcore") && has("ultimate_ironman") && has("craftsman")) {
    return "HUIC";
  }

  if (has("hardcore") && has("ironman") && has("craftsman") && has("hunted")) {
    return "HICH";
  }

  if (has("hardcore") && has("ironman") && has("craftsman")) {
    return "HIC";
  }

  if (modes.size === 0) {
    return "Normal";
  }

  const labels: string[] = [];

  if (has("craftsman")) {
    labels.push("Craftsman");
  }

  if (has("hardcore")) {
    labels.push("Hardcore");
  }

  if (has("hunted")) {
    labels.push("Hunted");
  }

  if (has("ultimate_ironman")) {
    labels.push("Ultimate Ironman");
  } else if (has("ironman")) {
    labels.push("Ironman");
  }

  return labels.join(", ");
}

function getGuildMemberJoinedAt(
  guild: WynncraftGuildResponse | null,
  player: WynncraftPlayerResponse
): string | null {
  if (!guild?.members || !player.username) {
    return null;
  }

  for (const rankGroup of Object.values(guild.members)) {
    for (const [username, member] of Object.entries(rankGroup ?? {})) {
      if (
        member &&
        (member.uuid === player.uuid ||
          username.localeCompare(player.username, undefined, { sensitivity: "accent" }) === 0)
      ) {
        return member.joined ?? null;
      }
    }
  }

  return null;
}

function formatGuildTitle(player: WynncraftPlayerResponse): string {
  if (!player.guild?.name) {
    return "No Guild";
  }

  if (player.guild.prefix) {
    return `${player.guild.name} [${player.guild.prefix}]`;
  }

  return player.guild.name;
}

function getCharacterListTokens(player: WynncraftPlayerResponse): string[] {
  return getCharacterEntries(player).map(([, character]) => {
    const shortCode = getCharacterShortCode(character) ?? "Ch";
    return `${shortCode}[${getMetricValue(character.level)}]`;
  });
}

async function buildCharacterListText(
  tokens: string[],
  maxWidth: number,
  fontSize: number,
  maxLines: number
): Promise<string> {
  if (tokens.length === 0) {
    return "None";
  }

  const lines: string[] = [];
  let index = 0;

  while (index < tokens.length && lines.length < maxLines) {
    let currentLine = tokens[index];
    index += 1;

    while (index < tokens.length) {
      const nextCandidate = `${currentLine}, ${tokens[index]}`;
      const candidateWidth = await measureTextWidth(nextCandidate, fontSize);

      if (candidateWidth > maxWidth) {
        break;
      }

      currentLine = nextCandidate;
      index += 1;
    }

    lines.push(currentLine);
  }

  const remaining = tokens.length - index;

  if (remaining <= 0) {
    return lines.join("\n");
  }

  const suffix = `(+${remaining} more)`;
  const lastLineIndex = lines.length - 1;

  if (lastLineIndex >= 0) {
    let candidate = `${lines[lastLineIndex]}, ${suffix}`;
    let width = await measureTextWidth(candidate, fontSize);

    if (width <= maxWidth) {
      lines[lastLineIndex] = candidate;
      return lines.join("\n");
    }

    if (lines.length < maxLines) {
      lines.push(suffix);
      return lines.join("\n");
    }

    let trimmedLine = lines[lastLineIndex];

    while (trimmedLine.includes(",")) {
      trimmedLine = trimmedLine.slice(0, trimmedLine.lastIndexOf(","));
      candidate = `${trimmedLine}, ${suffix}`;
      width = await measureTextWidth(candidate, fontSize);

      if (width <= maxWidth) {
        lines[lastLineIndex] = candidate;
        return lines.join("\n");
      }
    }

    lines[lastLineIndex] = suffix;
  }

  return lines.join("\n");
}

async function fetchGuildProfile(
  prefix: string | null | undefined
): Promise<WynncraftGuildResponse | null> {
  if (!prefix) {
    logInfo("/player guild profile fetch skipped because no guild prefix was present.");
    return null;
  }

  try {
    logInfo(`/player fetching guild profile from ${WYNNCRAFT_GUILD_PREFIX_URL}/${encodeURIComponent(prefix)}`);
    const response = await fetchWithWynncraftAuthFallback(
      `${WYNNCRAFT_GUILD_PREFIX_URL}/${encodeURIComponent(prefix)}`
    );

    if (!response.ok) {
      logWarning(`/player guild profile fetch returned HTTP ${response.status} for prefix ${prefix}.`);
      return null;
    }

    logInfo(`/player guild profile fetch succeeded for prefix ${prefix}.`);
    return (await response.json()) as WynncraftGuildResponse;
  } catch {
    logWarning(`/player guild profile fetch threw for prefix ${prefix}.`);
    return null;
  }
}

async function fetchOptionalBuffer(
  label: string,
  input: string,
  init?: RequestInit
): Promise<Buffer | null> {
  try {
    logInfo(`/player fetching ${label} from ${input}`);
    const response = await fetch(input, init);

    if (!response.ok) {
      logWarning(`/player ${label} fetch returned HTTP ${response.status} from ${input}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    logInfo(`/player fetched ${label} from ${input} (${buffer.byteLength} bytes)`);
    return buffer;
  } catch {
    logWarning(`/player ${label} fetch threw for ${input}`);
    return null;
  }
}

async function fetchPlayerSkinBuffer(username: string): Promise<Buffer | null> {
  return fetchOptionalBuffer(
    "player skin",
    `${IDENTICRAFT_BUST_RENDER_URL}/${encodeURIComponent(username)}/256.png`
  );
}

async function fetchGuildBannerBuffer(
  guild: WynncraftGuildResponse | null
): Promise<Buffer | null> {
  if (!guild?.banner?.base) {
    return null;
  }

  const layers = (guild.banner.layers ?? [])
    .filter((layer) => layer !== null)
    .map((layer) => {
      const bannerLayer = layer as { colour?: string | null; pattern?: string | null };
      const pattern = bannerLayer.pattern
        ? GUILD_BANNER_PATTERN_MAP[
            bannerLayer.pattern as keyof typeof GUILD_BANNER_PATTERN_MAP
          ]
        : null;

      if (!bannerLayer.colour || !pattern) {
        return null;
      }

      return {
        shape: pattern,
        color: bannerLayer.colour.toLowerCase()
      };
    })
    .filter((layer) => layer !== null);

  return fetchOptionalBuffer("banner image", BANNER_RENDER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      base: guild.banner.base.toLowerCase(),
      layers,
      height: 160,
      filetype: "png"
    })
  });
}

async function fetchPlayerCardAssets(player: WynncraftPlayerResponse) {
  logInfo(`/player preparing card assets for ${player.username}.`);
  const [guildProfile, skinBuffer] = await Promise.all([
    fetchGuildProfile(player.guild?.prefix),
    fetchPlayerSkinBuffer(player.username)
  ]);
  logInfo(
    `/player asset fetch checkpoint for ${player.username}: guildProfile=${guildProfile ? "yes" : "no"}, skin=${skinBuffer ? "yes" : "no"}`
  );
  const bannerBuffer = await fetchGuildBannerBuffer(guildProfile);
  logInfo(
    `/player asset fetch complete for ${player.username}: banner=${bannerBuffer ? "yes" : "no"}`
  );

  return {
    guildProfile,
    skinBuffer,
    bannerBuffer
  };
}

function buildPlayerSelectRow(
  player: WynncraftPlayerResponse,
  customId: string,
  selectedView: string,
  disabled = false
) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Select a profile view")
    .setDisabled(disabled)
    .addOptions([
      {
        label: "Main Profile",
        value: MAIN_PROFILE_VIEW,
        default: selectedView === MAIN_PROFILE_VIEW
      },
      ...getCharacterEntries(player).map(([id, character]) => ({
        label: `[${getMetricValue(character.level)}] ${formatCharacterMenuLabel(character)}`.slice(
          0,
          100
        ),
        value: id,
        default: selectedView === id
      }))
    ]);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildInlineTextRow(
  x: number,
  y: number,
  fontSize: number,
  gap: number,
  items: Array<{
    text: string;
    fontSize?: number;
    fill?: string;
    gapAfter?: number;
  }>
): Promise<PlayerCardTextLayer[]> {
  return (async () => {
    const layers: PlayerCardTextLayer[] = [];
    let currentX = x;

    for (const item of items) {
      const itemFontSize = item.fontSize ?? fontSize;
      layers.push({
        text: item.text,
        x: currentX,
        y,
        fontSize: itemFontSize,
        fill: item.fill ?? PLAYER_CARD_TEXT_COLOR
      });
      currentX +=
        (await measureTextWidth(item.text, itemFontSize)) + (item.gapAfter ?? gap);
    }

    return layers;
  })();
}

async function resizeContainedImage(
  buffer: Buffer,
  width: number,
  height: number,
  options?: {
    fit?: "contain" | "inside";
    background?: sharp.Color;
  }
): Promise<Buffer> {
  return sharp(buffer)
    .resize({
      width,
      height,
      fit: options?.fit ?? "contain",
      background: options?.background ?? { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
}

async function renderPlayerCardAttachment(
  player: WynncraftPlayerResponse,
  requestedBy: string,
  timeZone?: string | null
): Promise<AttachmentBuilder> {
  logInfo(`/player rendering main profile card for ${player.username}.`);
  const width = 1000;
  const height = 1500;
  const activeCharacter = getActiveCharacter(player);
  const { guildProfile, skinBuffer, bannerBuffer } = await fetchPlayerCardAssets(player);
  const guildJoinedAt = getGuildMemberJoinedAt(guildProfile, player);
  const joinedLineValue = player.firstJoin ?? guildJoinedAt ?? null;
  const globalData = player.globalData;
  const totalRaids = getRaidList(globalData?.raids);
  const guildRaids = getRaidList(globalData?.guildRaids);
  const pvpKills = getMetricValue(globalData?.pvp?.kills as number | null | undefined);
  const pvpDeaths = getMetricValue(globalData?.pvp?.deaths as number | null | undefined);
  const generatedDate = formatDateTimeForTimeZone(new Date(), timeZone);
  const headerText = `[${getDisplayRankLabel(player)}] ${player.username}`;
  const guildTitle = formatGuildTitle(player);
  const guildRankLabel = formatGuildRankLabel(player.guild?.rank);
  const statusText = player.online
    ? player.server
      ? `ONLINE ON ${player.server.toUpperCase()}`
      : "ONLINE"
    : player.server
      ? `OFFLINE (LAST ${player.server.toUpperCase()})`
      : "OFFLINE";
  const lastSeenText = !player.online ? formatCardDateTime(player.lastJoin, timeZone) : null;
  const classText = `Class: ${formatClassLabel(activeCharacter)}`;
  const playtimeText = formatHoursCompact(getMetricValue(player.playtime));
  const headerFontSize = await fitFontSize(headerText, 800, 60, 36);
  const guildTitleFontSize = await fitFontSize(guildTitle, 450, 50, 28);
  const guildRankFontSize = await fitFontSize(guildRankLabel, 450, 50, 28);
  const characterListText = await buildCharacterListText(
    getCharacterListTokens(player),
    290,
    30,
    6
  );

  const rectLayers: PlayerCardRectLayer[] = [
    { x: 100, y: 225, width: 800, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 100, y: 250, width: 200, height: 300, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 325, y: 250, width: 100, height: 160, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 350, y: 430, width: 50, height: 50, radius: 100, fill: player.online ? "#00FF00" : "#FF0000", opacity: 0.8 },
    { x: 100, y: 570, width: 800, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 100, y: 645, width: 500, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 625, y: 620, width: 5, height: 800, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 100, y: 915, width: 500, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 460, y: 990, width: 5, height: 430, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 650, y: 1120, width: 275, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 }
  ];

  const textLayers: PlayerCardTextLayer[] = [
    { text: headerText, x: 100, y: 150, fontSize: headerFontSize, fill: PLAYER_CARD_TEXT_COLOR },
    { text: guildTitle, x: 450, y: 265, fontSize: guildTitleFontSize, fill: PLAYER_CARD_TEXT_COLOR },
    { text: guildRankLabel, x: 450, y: 340, fontSize: guildRankFontSize, fill: PLAYER_CARD_TEXT_COLOR },
    { text: statusText, x: 425, y: 435, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: classText, x: 350, y: 510, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: `First Join: ${formatCardDate(joinedLineValue, timeZone)}`,
      x: 100,
      y: 595,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Playtime", x: 650, y: 595, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "PvP", x: 650, y: 705, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Wars", x: 650, y: 815, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "World Events", x: 650, y: 925, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Dungeons", x: 650, y: 1035, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Mobs Killed", x: 100, y: 670, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(getMetricValue(globalData?.mobsKilled ?? globalData?.killedMobs)),
      x: 560,
      y: 670,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Chests", x: 100, y: 730, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(getMetricValue(globalData?.chestsFound)),
      x: 560,
      y: 730,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Quests", x: 100, y: 790, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(getMetricValue(globalData?.completedQuests)),
      x: 560,
      y: 790,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Total Levels", x: 100, y: 850, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(getMetricValue(globalData?.totalLevel ?? globalData?.totalLevels)),
      x: 560,
      y: 850,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Raid Completion", x: 100, y: 935, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Guild", x: 450, y: 990, fontSize: 40, anchor: "right", fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Total", x: 605, y: 990, fontSize: 40, anchor: "right", fill: PLAYER_CARD_TEXT_COLOR },
    { text: "NOTG", x: 100, y: 1030, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(guildRaids.notg),
      x: 450,
      y: 1030,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(totalRaids.notg),
      x: 605,
      y: 1030,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "NOL", x: 100, y: 1100, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(guildRaids.nol),
      x: 450,
      y: 1100,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(totalRaids.nol),
      x: 605,
      y: 1100,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "TCC", x: 100, y: 1170, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(guildRaids.tcc),
      x: 450,
      y: 1170,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(totalRaids.tcc),
      x: 605,
      y: 1170,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "TNA", x: 100, y: 1240, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(guildRaids.tna),
      x: 450,
      y: 1240,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(totalRaids.tna),
      x: 605,
      y: 1240,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "TWP", x: 100, y: 1310, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(guildRaids.twp),
      x: 450,
      y: 1310,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(totalRaids.twp),
      x: 605,
      y: 1310,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Total", x: 100, y: 1380, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(guildRaids.total),
      x: 450,
      y: 1380,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(totalRaids.total),
      x: 605,
      y: 1380,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Characters", x: 650, y: 1140, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: characterListText, x: 650, y: 1180, fontSize: 30, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: `Generated at ${generatedDate} on request of ${requestedBy}`,
      x: 40,
      y: 1470,
      fontSize: 25,
      fill: PLAYER_CARD_TEXT_COLOR
    }
  ];

  if (lastSeenText) {
    textLayers.push({
      text: `Last seen at ${lastSeenText}`,
      x: 425,
      y: 480,
      fontSize: 20,
      fill: PLAYER_CARD_TEXT_COLOR
    });
  }

  const rankingLayers: Array<[string | null, number, number, "left" | "right"]> = [
    [getRankingLine(player, "warsCompletion"), 650, 890, "left"],
    [getRankingLine(player, "totalGlobalLevel"), 560, 890, "right"],
    [getRankingLine(player, "grootslangCompletion"), 605, 1069, "right"],
    [getRankingLine(player, "orphionCompletion"), 605, 1139, "right"],
    [getRankingLine(player, "colossusCompletion"), 605, 1209, "right"],
    [getRankingLine(player, "namelessCompletion"), 605, 1279, "right"],
    [getRankingLine(player, "frumaCompletion"), 605, 1349, "right"]
  ];

  for (const [line, x, y, anchor] of rankingLayers) {
    if (!line) {
      continue;
    }

    textLayers.push({
      text: line,
      x,
      y,
      fontSize: 25,
      anchor,
      fill: PLAYER_CARD_TEXT_COLOR
    });
  }

  textLayers.push(
    {
      text: formatNumber(getMetricValue(globalData?.wars)),
      x: 650,
      y: 855,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(getMetricValue(globalData?.worldEvents)),
      x: 650,
      y: 965,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(getMetricValue(globalData?.dungeons?.total)),
      x: 650,
      y: 1075,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    }
  );

  textLayers.push(
    ...(await buildInlineTextRow(650, 635, 40, 10, [
      { text: playtimeText },
      { text: "hours", fontSize: 20 }
    ]))
  );

  textLayers.push(
    ...(await buildInlineTextRow(650, 745, 40, 10, [
      { text: formatNumber(pvpKills) },
      { text: "K", fontSize: 20, gapAfter: 15 },
      { text: "/", fontSize: 40, gapAfter: 15 },
      { text: formatNumber(pvpDeaths), fontSize: 40, gapAfter: 10 },
      { text: "D", fontSize: 20 }
    ]))
  );

  let image = sharp(PLAYER_CARD_BACKGROUND_BUFFER).rotate().resize({
    width,
    height,
    fit: "cover",
    position: "centre"
  });

  const composites: sharp.OverlayOptions[] = [
    {
      input: buildShapeOverlaySvg(width, height, rectLayers),
      blend: "over"
    }
  ];

  if (skinBuffer) {
    const skinImage = await resizeContainedImage(skinBuffer, 180, 270, {
      fit: "inside"
    });
    const metadata = await sharp(skinImage).metadata();
    composites.push({
      input: skinImage,
      left: 100 + Math.round((200 - (metadata.width ?? 200)) / 2),
      top: 250 + Math.round(300 - (metadata.height ?? 300))
    });
  }

  if (bannerBuffer) {
    const bannerImage = await resizeContainedImage(bannerBuffer, 100, 160, {
      fit: "inside"
    });
    const metadata = await sharp(bannerImage).metadata();
    composites.push({
      input: bannerImage,
      left: 325 + Math.round((100 - (metadata.width ?? 100)) / 2),
      top: 250 + Math.round((160 - (metadata.height ?? 160)) / 2)
    });
  }

  composites.push(...(await buildTextComposites(textLayers)));

  image = image.composite(composites);
  logInfo(`/player main profile card composite complete for ${player.username}.`);

  return new AttachmentBuilder(await image.png().toBuffer(), {
    name: PLAYER_CARD_FILENAME
  });
}

async function renderCharacterCardAttachment(
  player: WynncraftPlayerResponse,
  characterId: string,
  character: WynncraftCharacter,
  requestedBy: string,
  timeZone?: string | null
): Promise<AttachmentBuilder> {
  logInfo(`/player rendering character card for ${player.username} (${characterId}).`);
  const width = 1000;
  const height = 1500;
  const { guildProfile, skinBuffer, bannerBuffer } = await fetchPlayerCardAssets(player);
  const raids = getRaidList(character.raids);
  const classText = `Class: ${formatClassLabel(character)}`;
  const headerText = formatCharacterHeaderText(player, character);
  const guildTitle = formatGuildTitle(player);
  const guildRankLabel = formatGuildRankLabel(player.guild?.rank);
  const isUsing = player.online === true && player.activeCharacter === characterId;
  const statusText = isUsing
    ? player.server
      ? `USING ON ${player.server.toUpperCase()}`
      : "USING"
    : "NOT USING";
  const headerFontSize = await fitFontSize(headerText, 800, 60, 36);
  const guildTitleFontSize = await fitFontSize(guildTitle, 450, 50, 28);
  const guildRankFontSize = await fitFontSize(guildRankLabel, 450, 50, 28);
  const generatedDate = formatDateTimeForTimeZone(new Date(), timeZone);
  const pvpKills = getMetricValue(character.pvp?.kills);
  const pvpDeaths = getMetricValue(character.pvp?.deaths);
  const playtimeText = formatHoursCompact(getMetricValue(character.playtime));

  const rectLayers: PlayerCardRectLayer[] = [
    { x: 100, y: 225, width: 800, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 100, y: 250, width: 200, height: 300, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 325, y: 250, width: 100, height: 160, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    {
      x: 350,
      y: 430,
      width: 50,
      height: 50,
      radius: 100,
      fill: isUsing ? "#00FF00" : "#FF0000",
      opacity: 0.8
    },
    { x: 100, y: 570, width: 800, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 625, y: 620, width: 5, height: 800, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 100, y: 830, width: 500, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 },
    { x: 100, y: 1280, width: 500, height: 5, fill: PLAYER_CARD_TEXT_COLOR, opacity: 0.8 }
  ];

  const textLayers: PlayerCardTextLayer[] = [
    { text: headerText, x: 100, y: 150, fontSize: headerFontSize, fill: PLAYER_CARD_TEXT_COLOR },
    { text: guildTitle, x: 450, y: 265, fontSize: guildTitleFontSize, fill: PLAYER_CARD_TEXT_COLOR },
    { text: guildRankLabel, x: 450, y: 340, fontSize: guildRankFontSize, fill: PLAYER_CARD_TEXT_COLOR },
    { text: statusText, x: 425, y: 435, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: classText, x: 350, y: 510, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Playtime", x: 650, y: 595, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "PvP", x: 650, y: 705, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Wars", x: 650, y: 815, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "World Events", x: 650, y: 925, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Dungeons", x: 650, y: 1035, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Raids", x: 650, y: 1145, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatNumber(raids.total), x: 650, y: 1185, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    { text: `NOTG ${formatNumber(raids.notg)}`, x: 650, y: 1225, fontSize: 30, fill: PLAYER_CARD_TEXT_COLOR },
    { text: `NOL ${formatNumber(raids.nol)}`, x: 650, y: 1255, fontSize: 30, fill: PLAYER_CARD_TEXT_COLOR },
    { text: `TCC ${formatNumber(raids.tcc)}`, x: 650, y: 1285, fontSize: 30, fill: PLAYER_CARD_TEXT_COLOR },
    { text: `TNA ${formatNumber(raids.tna)}`, x: 650, y: 1315, fontSize: 30, fill: PLAYER_CARD_TEXT_COLOR },
    { text: `TWP ${formatNumber(raids.twp)}`, x: 650, y: 1345, fontSize: 30, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Mobs Killed", x: 100, y: 595, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(getMetricValue(character.mobsKilled ?? character.killedMobs)),
      x: 560,
      y: 595,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Chests", x: 100, y: 655, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(getMetricValue(character.chestsFound)),
      x: 560,
      y: 655,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Quests", x: 100, y: 715, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatNumber(character.quests?.length ?? 0),
      x: 560,
      y: 715,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Walked", x: 100, y: 775, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: abbreviateNumber(normalizeWalkedBlocks(character.blocksWalked)),
      x: 560,
      y: 775,
      fontSize: 40,
      anchor: "right",
      fill: PLAYER_CARD_TEXT_COLOR
    },
    { text: "Fishing", x: 100, y: 855, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "fishing"), x: 430, y: 855, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Woodcutting", x: 100, y: 890, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "woodcutting"), x: 430, y: 890, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Mining", x: 100, y: 925, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "mining"), x: 430, y: 925, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Farming", x: 100, y: 960, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "farming"), x: 430, y: 960, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Scribing", x: 100, y: 995, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "scribing"), x: 430, y: 995, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Jeweling", x: 100, y: 1030, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "jeweling"), x: 430, y: 1030, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Alchemism", x: 100, y: 1065, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "alchemism"), x: 430, y: 1065, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Cooking", x: 100, y: 1100, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "cooking"), x: 430, y: 1100, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Weaponsmithing", x: 100, y: 1135, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "weaponsmithing"), x: 430, y: 1135, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Tailoring", x: 100, y: 1170, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "tailoring"), x: 430, y: 1170, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Woodworking", x: 100, y: 1205, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "woodworking"), x: 430, y: 1205, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Armouring", x: 100, y: 1240, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: formatProfessionProgress(character.professions, "armouring"), x: 430, y: 1240, fontSize: 28, fill: PLAYER_CARD_TEXT_COLOR },
    { text: "Gamemode", x: 100, y: 1300, fontSize: 40, fill: PLAYER_CARD_TEXT_COLOR },
    {
      text: formatGamemodeLabel(character.gamemode),
      x: 100,
      y: 1360,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: `Generated at ${generatedDate} on request of ${requestedBy}`,
      x: 40,
      y: 1470,
      fontSize: 25,
      fill: PLAYER_CARD_TEXT_COLOR
    }
  ];

  textLayers.push(
    {
      text: formatNumber(getMetricValue(character.wars)),
      x: 650,
      y: 855,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(getMetricValue(character.worldEvents)),
      x: 650,
      y: 965,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    },
    {
      text: formatNumber(getMetricValue(character.dungeons?.total)),
      x: 650,
      y: 1075,
      fontSize: 40,
      fill: PLAYER_CARD_TEXT_COLOR
    }
  );

  textLayers.push(
    ...(await buildInlineTextRow(650, 635, 40, 10, [
      { text: playtimeText },
      { text: "hours", fontSize: 20 }
    ]))
  );

  textLayers.push(
    ...(await buildInlineTextRow(650, 745, 40, 10, [
      { text: formatNumber(pvpKills) },
      { text: "K", fontSize: 20, gapAfter: 15 },
      { text: "/", fontSize: 40, gapAfter: 15 },
      { text: formatNumber(pvpDeaths), fontSize: 40, gapAfter: 10 },
      { text: "D", fontSize: 20 }
    ]))
  );

  let image = sharp(PLAYER_CARD_BACKGROUND_BUFFER).rotate().resize({
    width,
    height,
    fit: "cover",
    position: "centre"
  });

  const composites: sharp.OverlayOptions[] = [
    {
      input: buildShapeOverlaySvg(width, height, rectLayers),
      blend: "over"
    }
  ];

  if (skinBuffer) {
    const skinImage = await resizeContainedImage(skinBuffer, 180, 270, {
      fit: "inside"
    });
    const metadata = await sharp(skinImage).metadata();
    composites.push({
      input: skinImage,
      left: 100 + Math.round((200 - (metadata.width ?? 200)) / 2),
      top: 250 + Math.round(300 - (metadata.height ?? 300))
    });
  }

  if (bannerBuffer) {
    const bannerImage = await resizeContainedImage(bannerBuffer, 100, 160, {
      fit: "inside"
    });
    const metadata = await sharp(bannerImage).metadata();
    composites.push({
      input: bannerImage,
      left: 325 + Math.round((100 - (metadata.width ?? 100)) / 2),
      top: 250 + Math.round((160 - (metadata.height ?? 160)) / 2)
    });
  }

  composites.push(...(await buildTextComposites(textLayers)));

  image = image.composite(composites);
  logInfo(`/player character card composite complete for ${player.username} (${characterId}).`);

  return new AttachmentBuilder(await image.png().toBuffer(), {
    name: PLAYER_CARD_FILENAME
  });
}

export async function buildPlayerReply(
  player: WynncraftPlayerResponse,
  requestedBy: string,
  customId: string,
  selectedView = MAIN_PROFILE_VIEW,
  disableMenu = false,
  timeZone?: string | null
): Promise<{
  attachments: [];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
  files: AttachmentBuilder[];
}> {
  const selectedCharacter = getSelectedCharacter(player, selectedView);
  logInfo(
    `/player building reply for ${player.username}; view=${selectedCharacter ? selectedCharacter.id : MAIN_PROFILE_VIEW}; disableMenu=${disableMenu}`
  );
  const attachment = selectedCharacter
    ? await renderCharacterCardAttachment(
        player,
        selectedCharacter.id,
        selectedCharacter.character,
        requestedBy,
        timeZone
      )
    : await renderPlayerCardAttachment(player, requestedBy, timeZone);

  return {
    attachments: [],
    components: [buildPlayerSelectRow(player, customId, selectedCharacter?.id ?? MAIN_PROFILE_VIEW, disableMenu)],
    files: [attachment]
  };
}
