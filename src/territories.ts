import { readFileSync } from "node:fs";

import { fetchWithWynncraftAuthFallback } from "./wynncraft.js";

const WYNNCRAFT_TERRITORY_LIST_URL =
  "https://api.wynncraft.com/v3/guild/list/territory";
const WYNNCRAFT_GUILD_PREFIX_URL = "https://api.wynncraft.com/v3/guild/prefix";

const TERRITORY_RESOURCE_TYPES = [
  "EMERALD",
  "WOOD",
  "FISH",
  "ORE",
  "CROP"
] as const;

export type TerritoryResourceType = (typeof TERRITORY_RESOURCE_TYPES)[number];

type TerritoryListEntry = {
  guild?: {
    uuid?: string;
    name?: string;
    prefix?: string;
    color?: string | null;
    hq?: string | null;
  } | null;
  acquired?: string | null;
  location?: {
    start?: [number, number] | null;
    end?: [number, number] | null;
  } | null;
  hq?: boolean | null;
  resources?: Array<{
    type?: string | null;
    generation?: number | null;
    baseGeneration?: number | null;
    stored?: number | null;
    limit?: number | null;
  }> | null;
  links?: string[] | null;
  treasury?: string | null;
  defences?: string | null;
};

type TerritoryListResponse = Record<string, TerritoryListEntry>;

type GuildMemberEntry = {
  online?: boolean | null;
  server?: string | null;
};

type BundledTerritoryEntry = {
  "Trading Routes"?: string[] | null;
};

const bundledTerritoryNames = loadBundledTerritoryNames();
const bundledTerritoryRouteMap = loadBundledTerritoryRouteMap();

const GUILD_RANK_KEYS = [
  "owner",
  "chief",
  "strategist",
  "captain",
  "recruiter",
  "recruit"
] as const;

type GuildRankKey = (typeof GUILD_RANK_KEYS)[number];

type GuildDetailResponse = {
  uuid?: string;
  name?: string;
  prefix?: string;
  color?: string | null;
  level?: number | null;
  territories?: number | null;
  online?: number | null;
  members?: {
    total?: number | null;
    owner?: Record<string, GuildMemberEntry> | null;
    chief?: Record<string, GuildMemberEntry> | null;
    strategist?: Record<string, GuildMemberEntry> | null;
    captain?: Record<string, GuildMemberEntry> | null;
    recruiter?: Record<string, GuildMemberEntry> | null;
    recruit?: Record<string, GuildMemberEntry> | null;
  } | null;
};

export type TerritoryResourceState = {
  type: TerritoryResourceType;
  generation: number;
  baseGeneration: number;
  stored: number;
  limit: number;
};

export type TerritoryState = {
  territoryName: string;
  guildUuid: string;
  guildName: string;
  guildPrefix: string;
  guildColor?: string | null;
  acquiredAt?: string | null;
  hqTerritoryName: string | null;
  startX: number | null;
  startZ: number | null;
  endX: number | null;
  endZ: number | null;
  isHq: boolean;
  treasury: string | null;
  defences: string | null;
  resources: TerritoryResourceState[];
  links: string[];
};

export type FetchedTerritoryStateSnapshot = {
  fetchedAt: Date;
  territoryLastTick: Date | null;
  territories: TerritoryState[];
};

type FetchTerritoryStateSnapshotOptions = {
  includeIncompleteGuilds?: boolean;
};

export type GuildTerritoryDetail = {
  uuid: string;
  name: string;
  prefix: string;
  level: number;
  territories: number;
  online: number;
  totalMembers: number;
  onlineMembersByRank: Record<
    GuildRankKey,
    Array<{
      username: string;
      server: string | null;
    }>
  >;
};

function loadBundledTerritoryNames(): string[] {
  try {
    const contents = readFileSync(
      new URL("../public/territories.json", import.meta.url),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Record<string, BundledTerritoryEntry>;
    return Object.keys(parsed).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function loadBundledTerritoryRouteMap(): Map<string, string[]> {
  try {
    const contents = readFileSync(
      new URL("../public/territories.json", import.meta.url),
      "utf8"
    );
    const parsed = JSON.parse(contents) as Record<string, BundledTerritoryEntry>;

    return new Map(
      Object.entries(parsed).map(([territoryName, entry]) => [
        territoryName,
        Array.from(
          new Set(
            (entry["Trading Routes"] ?? [])
              .filter((route): route is string => typeof route === "string" && route.trim().length > 0)
              .map((route) => route.trim())
          )
        ).sort((left, right) => left.localeCompare(right))
      ])
    );
  } catch {
    return new Map();
  }
}

function normalizeNumericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeCoordinate(
  pair: [number, number] | null | undefined,
  index: 0 | 1
): number | null {
  if (!Array.isArray(pair) || pair.length <= index) {
    return null;
  }

  const value = pair[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeResourceType(value: string | null | undefined): TerritoryResourceType | null {
  if (!value) {
    return null;
  }

  return TERRITORY_RESOURCE_TYPES.includes(value as TerritoryResourceType)
    ? (value as TerritoryResourceType)
    : null;
}

function normalizeResources(
  resources: TerritoryListEntry["resources"]
): TerritoryResourceState[] {
  const mappedResources = new Map<TerritoryResourceType, TerritoryResourceState>();

  for (const resource of resources ?? []) {
    const type = normalizeResourceType(resource?.type);

    if (!type) {
      continue;
    }

    mappedResources.set(type, {
      type,
      generation: normalizeNumericValue(resource?.generation),
      baseGeneration:
        normalizeNumericValue(resource?.generation) > 0
          ? normalizeNumericValue(resource?.baseGeneration)
          : 0,
      stored: normalizeNumericValue(resource?.stored),
      limit: normalizeNumericValue(resource?.limit)
    });
  }

  return TERRITORY_RESOURCE_TYPES.map((type) => {
    const resource = mappedResources.get(type);
    return (
      resource ?? {
        type,
        generation: 0,
        baseGeneration: 0,
        stored: 0,
        limit: 0
      }
    );
  });
}

function normalizeLinks(links: string[] | null | undefined): string[] {
  return Array.from(
    new Set(
      (links ?? [])
        .filter((link): link is string => typeof link === "string" && link.trim().length > 0)
        .map((link) => link.trim())
    )
  ).sort((left, right) => left.localeCompare(right));
}

function extractOnlineMembers(
  group: Record<string, GuildMemberEntry> | null | undefined
): Array<{
  username: string;
  server: string | null;
}> {
  return Object.entries(group ?? {})
    .filter(([, member]) => member.online === true)
    .map(([username, member]) => ({
      username,
      server: member.server ?? null
    }));
}

export function getBundledTerritoryNames(): string[] {
  return [...bundledTerritoryNames];
}

export function getBundledTerritoryTradingRoutes(territoryName: string): string[] | null {
  const routes = bundledTerritoryRouteMap.get(territoryName);
  return routes ? [...routes] : null;
}

async function fetchTerritoryListResponse(): Promise<Response> {
  const response = await fetchWithWynncraftAuthFallback(WYNNCRAFT_TERRITORY_LIST_URL);

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  return fetch(WYNNCRAFT_TERRITORY_LIST_URL);
}

function parseTerritoryLastTickHeader(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(" ", "T").replace(/(\.\d{3})\d+([+-]\d\d:\d\d)$/, "$1$2");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function fetchTerritoryStateSnapshot(
  options: FetchTerritoryStateSnapshotOptions = {}
): Promise<FetchedTerritoryStateSnapshot> {
  const response = await fetchTerritoryListResponse();

  if (!response.ok) {
    throw new Error(`Wynncraft API returned ${response.status}`);
  }

  const territories = (await response.json()) as TerritoryListResponse;
  const fetchedAt = new Date();
  const territoryLastTick =
    parseTerritoryLastTickHeader(response.headers.get("territorylasttick")) ??
    parseTerritoryLastTickHeader(response.headers.get("Territorylasttick"));

  return {
    fetchedAt,
    territoryLastTick,
    territories: Object.entries(territories)
      .flatMap(([territoryName, entry]) => {
        const guildUuid = entry.guild?.uuid;
        const guildName = entry.guild?.name;
        const guildPrefix = entry.guild?.prefix;

        if (!guildUuid || !guildName || !guildPrefix) {
          if (!options.includeIncompleteGuilds) {
            return [];
          }
        }

        const hqTerritoryName =
          typeof entry.guild?.hq === "string" && entry.guild.hq.trim().length > 0
            ? entry.guild.hq.trim()
            : entry.hq
              ? territoryName
              : null;

        return [
          {
            territoryName,
            guildUuid: guildUuid ?? "",
            guildName: guildName?.trim() || "Unknown",
            guildPrefix: guildPrefix?.trim() || "???",
            guildColor:
              typeof entry.guild?.color === "string" && entry.guild.color.trim().length > 0
                ? entry.guild.color.trim()
                : null,
            acquiredAt:
              typeof entry.acquired === "string" && entry.acquired.trim().length > 0
                ? entry.acquired.trim()
                : null,
            hqTerritoryName,
            startX: normalizeCoordinate(entry.location?.start, 0),
            startZ: normalizeCoordinate(entry.location?.start, 1),
            endX: normalizeCoordinate(entry.location?.end, 0),
            endZ: normalizeCoordinate(entry.location?.end, 1),
            isHq: entry.hq === true,
            treasury:
              typeof entry.treasury === "string" && entry.treasury.trim().length > 0
                ? entry.treasury.trim()
                : null,
            defences:
              typeof entry.defences === "string" && entry.defences.trim().length > 0
                ? entry.defences.trim()
                : null,
            resources: normalizeResources(entry.resources),
            links: normalizeLinks(entry.links)
          }
        ];
      })
      .sort((left, right) => left.territoryName.localeCompare(right.territoryName))
  };
}

export async function fetchTerritoryStates(): Promise<TerritoryState[]> {
  return (await fetchTerritoryStateSnapshot()).territories;
}

export async function fetchGuildTerritoryDetail(
  prefix: string
): Promise<GuildTerritoryDetail> {
  const response = await fetchWithWynncraftAuthFallback(
    `${WYNNCRAFT_GUILD_PREFIX_URL}/${encodeURIComponent(prefix)}`
  );

  if (!response.ok) {
    throw new Error(`Wynncraft API returned ${response.status}`);
  }

  const guild = (await response.json()) as GuildDetailResponse;

  if (!guild.uuid || !guild.name || !guild.prefix) {
    throw new Error("Wynncraft returned an invalid guild payload.");
  }

  return {
    uuid: guild.uuid,
    name: guild.name,
    prefix: guild.prefix,
    level: typeof guild.level === "number" ? guild.level : 0,
    territories: typeof guild.territories === "number" ? guild.territories : 0,
    online: typeof guild.online === "number" ? guild.online : 0,
    totalMembers:
      typeof guild.members?.total === "number" ? guild.members.total : 0,
    onlineMembersByRank: {
      owner: extractOnlineMembers(guild.members?.owner),
      chief: extractOnlineMembers(guild.members?.chief),
      strategist: extractOnlineMembers(guild.members?.strategist),
      captain: extractOnlineMembers(guild.members?.captain),
      recruiter: extractOnlineMembers(guild.members?.recruiter),
      recruit: extractOnlineMembers(guild.members?.recruit)
    }
  };
}

export async function fetchGuildColorByPrefix(prefix: string): Promise<string | null> {
  const response = await fetchWithWynncraftAuthFallback(
    `${WYNNCRAFT_GUILD_PREFIX_URL}/${encodeURIComponent(prefix)}`
  );

  if (!response.ok) {
    throw new Error(`Wynncraft API returned ${response.status}`);
  }

  const guild = (await response.json()) as GuildDetailResponse;
  return typeof guild.color === "string" && guild.color.trim().length > 0
    ? guild.color.trim()
    : null;
}
