import { fetchTerritoryStateSnapshot, type TerritoryResourceType, type TerritoryState } from "./territories.js";
import {
  buildTerritoryMapSummary,
  getPregeneratedDefaultTerritoryMap,
  renderTerritoryMap,
  renderTerritoryNeighborhoodMap,
  type TerritoryMapSnapshot
} from "./territoryMap.js";
import { getBundledWynntilsGuildColor } from "./wynntilsGuildColors.js";
import {
  formatLeaderboardCardPeriod,
  LEADERBOARD_CARD_FIRST_PAGE_SIZE,
  LEADERBOARD_CARD_LATER_PAGE_SIZE,
  renderLeaderboardCard,
  type LeaderboardCardRow
} from "./leaderboardCard.js";
import { buildFilePayload, getAttachmentBuffer, type FilePayload } from "./renderResponse.js";

type LeaderboardMetric = "wars" | "total" | "notg" | "nol" | "tcc" | "tna" | "twp";

type LeaderboardMetricSnapshot = {
  wars: number;
  totalRaids: number;
  notgRaids: number;
  nolRaids: number;
  tccRaids: number;
  tnaRaids: number;
  twpRaids: number;
};

type LeaderboardSnapshotRecord = LeaderboardMetricSnapshot & {
  memberUuid: string;
  username: string;
  snapshotHour: Date;
};

type LeaderboardCurrentRecord = LeaderboardMetricSnapshot & {
  uuid: string;
  username: string;
  updatedAt: Date;
};

type LeaderboardDeltaRow = {
  rank: number;
  username: string;
  delta: number;
  startValue: number;
  endValue: number;
};

type LeaderboardCurrentRow = {
  rank: number;
  username: string;
  value: number;
};

export type MapCommandArgs = {
  resourceFilter?: TerritoryResourceType | null;
  defenceFilter?: string | null;
  treasuryFilter?: string | null;
  guildFilter?: string | null;
};

export type MapCommandResult = {
  content: string;
  file: FilePayload;
};

export type TerritoryCommandResult = {
  snapshot: TerritoryMapSnapshot;
  territory: TerritoryState;
  file: FilePayload;
};

export type LeaderboardImageCommandArgs = {
  mode: "current" | "delta";
  metric: LeaderboardMetric;
  pageIndex?: number;
  requestedBy: string;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
};

export type LeaderboardImageCommandResult = {
  pageIndex: number;
  totalPages: number;
  totalRows: number;
  emptyMessage?: string;
  file?: FilePayload;
};

const TERRITORY_NAMES_CACHE_TTL_MS = 30_000;

const LEADERBOARD_METRIC_LABELS: Record<LeaderboardMetric, string> = {
  wars: "Wars",
  total: "Total",
  notg: "NOTG",
  nol: "NOL",
  tcc: "TCC",
  tna: "TNA",
  twp: "TWP"
};

let cachedTerritoryNames:
  | { names: string[]; expiresAt: number }
  | null = null;

const guildRaidMemberLeaderboardSelect = {
  uuid: true,
  username: true,
  updatedAt: true,
  wars: true,
  totalRaids: true,
  notgRaids: true,
  nolRaids: true,
  tccRaids: true,
  tnaRaids: true,
  twpRaids: true
} as const;

const guildRaidMemberHourlySnapshotLeaderboardSelect = {
  memberUuid: true,
  username: true,
  snapshotHour: true,
  wars: true,
  totalRaids: true,
  notgRaids: true,
  nolRaids: true,
  tccRaids: true,
  tnaRaids: true,
  twpRaids: true
} as const;

function normalizeGuildMatch(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeErrorText(value: string): string {
  return value.replace(/`/g, "'").replace(/\s+/g, " ").trim();
}

function territoryHasResource(
  territory: TerritoryState,
  resourceType: TerritoryResourceType
): boolean {
  const resource = territory.resources.find((entry) => entry.type === resourceType);
  return (resource?.generation ?? 0) > 0 || (resource?.baseGeneration ?? 0) > 0;
}

function filterTerritoryMapSnapshot(
  snapshot: TerritoryMapSnapshot,
  options: MapCommandArgs
): TerritoryMapSnapshot {
  const guildNeedle = options.guildFilter ? normalizeGuildMatch(options.guildFilter) : null;

  return {
    ...snapshot,
    territories: snapshot.territories.filter((territory) => {
      if (options.resourceFilter && !territoryHasResource(territory, options.resourceFilter)) {
        return false;
      }

      if (options.defenceFilter && (territory.defences ?? "NONE").toUpperCase() !== options.defenceFilter) {
        return false;
      }

      if (options.treasuryFilter && (territory.treasury ?? "NONE").toUpperCase() !== options.treasuryFilter) {
        return false;
      }

      if (
        guildNeedle &&
        normalizeGuildMatch(territory.guildPrefix) !== guildNeedle &&
        normalizeGuildMatch(territory.guildName) !== guildNeedle
      ) {
        return false;
      }

      return true;
    })
  };
}

function resolveGuildColorMap(territories: TerritoryState[]): Map<string, string> {
  return new Map(
    territories
      .map((territory) => territory.guildPrefix.trim())
      .filter((prefix) => prefix.length > 0 && prefix !== "???")
      .map((prefix) => [prefix, getBundledWynntilsGuildColor(prefix)] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string")
  );
}

async function loadLiveTerritoryMapSnapshot(): Promise<TerritoryMapSnapshot> {
  const liveSnapshot = await fetchTerritoryStateSnapshot({
    includeIncompleteGuilds: true
  });

  return {
    source: "live",
    takenAt: liveSnapshot.fetchedAt,
    territoryLastTick: liveSnapshot.territoryLastTick,
    territories: liveSnapshot.territories
  };
}

function fileFromRenderedMap(buffer: Buffer): FilePayload {
  return buildFilePayload("territory-map.jpg", "image/jpeg", buffer);
}

export async function renderMapCommand(args: MapCommandArgs): Promise<MapCommandResult> {
  const snapshot = filterTerritoryMapSnapshot(await loadLiveTerritoryMapSnapshot(), args);

  if (snapshot.territories.length === 0) {
    return {
      content: "No territories matched those /map filters.",
      file: buildFilePayload("empty.txt", "text/plain", Buffer.from("", "utf8"))
    };
  }

  const guildColors = resolveGuildColorMap(snapshot.territories);
  const isDefaultFullMap =
    !args.resourceFilter &&
    !args.defenceFilter &&
    !args.treasuryFilter &&
    !args.guildFilter;
  const attachment = isDefaultFullMap
    ? await getPregeneratedDefaultTerritoryMap(snapshot, guildColors)
    : await renderTerritoryMap(snapshot, {
        cropToTerritories: Boolean(args.guildFilter),
        showChrome: !args.guildFilter,
        guildColors,
        cacheKeySuffix: [
          args.resourceFilter ?? "all-resources",
          args.defenceFilter ?? "all-defences",
          args.treasuryFilter ?? "all-treasuries",
          args.guildFilter ?? "all-guilds"
        ].join(":")
      });
  const filters = [
    args.resourceFilter ? `resource=${args.resourceFilter}` : null,
    args.defenceFilter ? `defences=${args.defenceFilter}` : null,
    args.treasuryFilter ? `treasury=${args.treasuryFilter}` : null,
    args.guildFilter ? `guild=${args.guildFilter}` : null
  ].filter((value): value is string => value !== null);

  return {
    content: `${buildTerritoryMapSummary(snapshot)}${filters.length > 0 ? ` Filters: ${filters.join(", ")}.` : ""}`,
    file: fileFromRenderedMap(getAttachmentBuffer(attachment))
  };
}

export async function renderTerritoryCommand(
  territoryName: string
): Promise<TerritoryCommandResult> {
  const snapshot = await loadLiveTerritoryMapSnapshot();
  const territory = snapshot.territories.find(
    (entry) => entry.territoryName.toLowerCase() === territoryName.toLowerCase()
  );

  if (!territory) {
    throw new Error(`Unknown territory: ${territoryName}`);
  }

  const attachment = await renderTerritoryNeighborhoodMap(
    snapshot,
    snapshot.territories,
    territory.territoryName,
    { guildColors: resolveGuildColorMap(snapshot.territories) }
  );

  return {
    snapshot,
    territory,
    file: buildFilePayload("territory-focus.jpg", "image/jpeg", getAttachmentBuffer(attachment))
  };
}

export async function fetchTerritoryNamesCommand(): Promise<string[]> {
  const now = Date.now();

  if (cachedTerritoryNames && cachedTerritoryNames.expiresAt > now) {
    return cachedTerritoryNames.names;
  }

  const snapshot = await loadLiveTerritoryMapSnapshot();
  const names = snapshot.territories
    .map((territory) => territory.territoryName)
    .sort((left, right) => left.localeCompare(right));

  cachedTerritoryNames = {
    names,
    expiresAt: now + TERRITORY_NAMES_CACHE_TTL_MS
  };

  return names;
}

function getLeaderboardMetricValue(
  snapshot: LeaderboardMetricSnapshot,
  metric: LeaderboardMetric
): number {
  switch (metric) {
    case "wars":
      return snapshot.wars;
    case "total":
      return snapshot.totalRaids;
    case "notg":
      return snapshot.notgRaids;
    case "nol":
      return snapshot.nolRaids;
    case "tcc":
      return snapshot.tccRaids;
    case "tna":
      return snapshot.tnaRaids;
    case "twp":
      return snapshot.twpRaids;
  }
}

function isZeroLeaderboardMetricSnapshot(snapshot: LeaderboardMetricSnapshot): boolean {
  return (
    snapshot.wars === 0 &&
    snapshot.totalRaids === 0 &&
    snapshot.notgRaids === 0 &&
    snapshot.nolRaids === 0 &&
    snapshot.tccRaids === 0 &&
    snapshot.tnaRaids === 0 &&
    snapshot.twpRaids === 0
  );
}

function buildLeaderboardDeltaRows(
  snapshots: LeaderboardSnapshotRecord[],
  metric: LeaderboardMetric,
  latestCurrentByUuid?: Map<string, LeaderboardCurrentRecord>
): LeaderboardDeltaRow[] {
  const snapshotsByMember = new Map<string, LeaderboardSnapshotRecord[]>();

  for (const snapshot of snapshots) {
    const existing = snapshotsByMember.get(snapshot.memberUuid);

    if (existing) {
      existing.push(snapshot);
    } else {
      snapshotsByMember.set(snapshot.memberUuid, [snapshot]);
    }
  }

  return Array.from(snapshotsByMember.values())
    .map((memberSnapshots) => {
      const firstSnapshot = memberSnapshots[0]!;
      const rawLastSnapshot = memberSnapshots[memberSnapshots.length - 1]!;
      const fallbackCurrentSnapshot =
        latestCurrentByUuid?.get(rawLastSnapshot.memberUuid) ?? null;
      const lastSnapshot =
        isZeroLeaderboardMetricSnapshot(rawLastSnapshot) &&
        fallbackCurrentSnapshot !== null
          ? fallbackCurrentSnapshot
          : rawLastSnapshot;
      const startValue = getLeaderboardMetricValue(firstSnapshot, metric);
      const endValue = getLeaderboardMetricValue(lastSnapshot, metric);
      const delta = endValue - startValue;

      return {
        username: sanitizeErrorText(lastSnapshot.username),
        delta,
        startValue,
        endValue
      };
    })
    .filter((row) => row.delta !== 0)
    .sort((left, right) =>
      right.delta - left.delta || left.username.localeCompare(right.username)
    )
    .map((row, index) => ({
      rank: index + 1,
      ...row
    }));
}

function buildLeaderboardCurrentRows(
  members: LeaderboardCurrentRecord[],
  metric: LeaderboardMetric
): LeaderboardCurrentRow[] {
  return members
    .map((member) => ({
      username: sanitizeErrorText(member.username),
      value: getLeaderboardMetricValue(member, metric)
    }))
    .sort((left, right) =>
      right.value - left.value || left.username.localeCompare(right.username)
    )
    .map((row, index) => ({
      rank: index + 1,
      ...row
    }));
}

function paginateLeaderboardCardRows<T>(rows: T[]): T[][] {
  if (rows.length === 0) {
    return [];
  }

  const pages: T[][] = [rows.slice(0, LEADERBOARD_CARD_FIRST_PAGE_SIZE)];

  for (
    let index = LEADERBOARD_CARD_FIRST_PAGE_SIZE;
    index < rows.length;
    index += LEADERBOARD_CARD_LATER_PAGE_SIZE
  ) {
    pages.push(rows.slice(index, index + LEADERBOARD_CARD_LATER_PAGE_SIZE));
  }

  return pages.filter((page) => page.length > 0);
}

function clampPageIndex(pageIndex: number | undefined, totalPages: number): number {
  return Math.max(0, Math.min(Number.isFinite(pageIndex ?? 0) ? pageIndex ?? 0 : 0, totalPages - 1));
}

export async function renderLeaderboardImageCommand(
  args: LeaderboardImageCommandArgs
): Promise<LeaderboardImageCommandResult> {
  const { prisma } = await import("./prisma.js");

  if (args.mode === "current") {
    const members = await prisma.guildRaidMember.findMany({
      select: guildRaidMemberLeaderboardSelect,
      orderBy: {
        username: "asc"
      }
    });

    if (members.length === 0) {
      return {
        pageIndex: 0,
        totalPages: 0,
        totalRows: 0,
        emptyMessage: "No current guild raid data is available."
      };
    }

    const rows = buildLeaderboardCurrentRows(members, args.metric);
    const pages = paginateLeaderboardCardRows(rows);
    const pageIndex = clampPageIndex(args.pageIndex, pages.length);
    const attachment = await renderLeaderboardCard({
      mode: "current",
      metricLabel: LEADERBOARD_METRIC_LABELS[args.metric],
      rows: pages[pageIndex]!.map((row): LeaderboardCardRow => ({
        rank: row.rank,
        username: row.username,
        value: row.value
      })),
      pageIndex,
      totalPages: pages.length,
      requestedBy: args.requestedBy,
      generatedAt: new Date(),
      timeZone: args.timeZone ?? null
    });

    return {
      pageIndex,
      totalPages: pages.length,
      totalRows: rows.length,
      file: buildFilePayload("leaderboard-card.png", "image/png", getAttachmentBuffer(attachment))
    };
  }

  const startDate = args.startDate ? new Date(args.startDate) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    throw new Error("Missing or invalid startDate for delta leaderboard.");
  }

  const endDate = args.endDate ? new Date(args.endDate) : undefined;
  const snapshots = await prisma.guildRaidMemberHourlySnapshot.findMany({
    where: {
      snapshotHour: {
        gte: startDate,
        ...(endDate ? { lte: endDate } : {})
      }
    },
    select: guildRaidMemberHourlySnapshotLeaderboardSelect,
    orderBy: [
      {
        memberUuid: "asc"
      },
      {
        snapshotHour: "asc"
      }
    ]
  });

  if (snapshots.length === 0) {
    return {
      pageIndex: 0,
      totalPages: 0,
      totalRows: 0,
      emptyMessage: "No leaderboard snapshots are available for that range."
    };
  }

  const latestCurrentByUuid =
    endDate === undefined
      ? new Map(
          (
            await prisma.guildRaidMember.findMany({
              select: guildRaidMemberLeaderboardSelect
            })
          ).map((member) => [member.uuid, member] as const)
        )
      : undefined;
  const rows = buildLeaderboardDeltaRows(snapshots, args.metric, latestCurrentByUuid);

  if (rows.length === 0) {
    return {
      pageIndex: 0,
      totalPages: 0,
      totalRows: 0,
      emptyMessage: "No leaderboard changes were found for that range."
    };
  }

  const pages = paginateLeaderboardCardRows(rows);
  const pageIndex = clampPageIndex(args.pageIndex, pages.length);
  const endSnapshotHour =
    latestCurrentByUuid && latestCurrentByUuid.size > 0
      ? Array.from(latestCurrentByUuid.values()).reduce(
          (latest, member) => (member.updatedAt > latest ? member.updatedAt : latest),
          snapshots[snapshots.length - 1]!.snapshotHour
        )
      : snapshots[snapshots.length - 1]!.snapshotHour;
  const attachment = await renderLeaderboardCard({
    mode: "delta",
    metricLabel: LEADERBOARD_METRIC_LABELS[args.metric],
    rows: pages[pageIndex]!.map((row): LeaderboardCardRow => ({
      rank: row.rank,
      username: row.username,
      value: row.delta
    })),
    pageIndex,
    totalPages: pages.length,
    requestedBy: args.requestedBy,
    generatedAt: new Date(),
    periodLabel: formatLeaderboardCardPeriod(startDate, endSnapshotHour, args.timeZone ?? null),
    timeZone: args.timeZone ?? null
  });

  return {
    pageIndex,
    totalPages: pages.length,
    totalRows: rows.length,
    file: buildFilePayload("leaderboard-card.png", "image/png", getAttachmentBuffer(attachment))
  };
}
