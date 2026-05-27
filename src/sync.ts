import { prisma } from "./prisma.js";
import type {
  GuildTerritoryBaseGeneration,
  GuildTerritoryState,
  TerritoryCurrentStateBlob,
} from "@prisma/client";
import {
  fetchGuildRaidTrackingData,
  type GuildRaidSnapshot,
  type GuildTomeSnapshot,
} from "./guildRaids.js";
import {
  fetchTerritoryStateSnapshot,
  type FetchedTerritoryStateSnapshot,
  type TerritoryState,
} from "./territories.js";
import { logInfo } from "./core/logging.js";

const RAID_RECENTLY_ONLINE_GRACE_MS = 10 * 60 * 1000;
const RAID_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const TERRITORY_SNAPSHOT_RETENTION_MS = 30 * 60 * 1000;
const TARGET_GUILD_NAME = "Empire of TKW";
const TARGET_GUILD_PREFIX = "ETKW";
const SYNC_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 20_000,
} as const;
const WRITE_BATCH_SIZE = 24;

const RAID_DELTAS = [
  { key: "notg", label: "NOTG" },
  { key: "nol", label: "NOL" },
  { key: "tcc", label: "TCC" },
  { key: "tna", label: "TNA" },
  { key: "twp", label: "TWP" },
] as const;

type RaidKey = (typeof RAID_DELTAS)[number]["key"];

type StoredRaidValues = {
  wars: number;
  totalRaids: number;
  notgRaids: number;
  nolRaids: number;
  tccRaids: number;
  tnaRaids: number;
  twpRaids: number;
  gambitsUsed: number;
};

type StoredRaidMember = StoredRaidValues & {
  uuid: string;
  username: string;
  contributed: bigint;
  joinedAt: Date | null;
  lastSeenOnlineAt: Date | null;
};

export type GuildRaidSyncChange = {
  uuid: string;
  username: string;
  previousUsername: string;
  deltas: {
    wars: number;
    total: number;
    notg: number;
    nol: number;
    tcc: number;
    tna: number;
    twp: number;
  };
  current: {
    wars: number;
    total: number;
    notg: number;
    nol: number;
    tcc: number;
    tna: number;
    twp: number;
  };
  line: string;
};

export type GuildRaidSyncResult = {
  ok: true;
  reason: string;
  snapshotHour: string;
  rosterMembers: number;
  fetchedSnapshots: number;
  inserted: number;
  updated: number;
  snapshotRowsInserted: number;
  tomeRowsInserted: number;
  leftGuildWarnings: Array<{ uuid: string; username: string }>;
  changes: GuildRaidSyncChange[];
};

type TerritoryBaseGenerationRow = {
  territoryName: string;
  emerald: number;
  wood: number;
  fish: number;
  ore: number;
  crop: number;
};

type GroupedGuildTerritoryRow = {
  key: string;
  guildUuid: string;
  guildName: string;
  guildPrefix: string;
  guildPrefixLower: string;
  territoriesJson: string;
};

type StoredTerritoryRow = {
  territoryName: string;
  guildUuid: string;
  guildName: string;
  guildPrefix: string;
  hqTerritoryName: string | null;
  startX: number | null;
  startZ: number | null;
  endX: number | null;
  endZ: number | null;
  isHq: boolean;
  treasury: string | null;
  defences: string | null;
};

export type TerritorySyncResult = {
  ok: true;
  fetchedAt: string;
  territoryLastTick: string | null;
  territoryCount: number;
  created: number;
  updated: number;
  deleted: number;
  captured: Array<{
    territoryName: string;
    previousGuildName: string;
    previousGuildPrefix: string;
    currentGuildName: string;
    currentGuildPrefix: string;
  }>;
  lost: Array<{
    territoryName: string;
    previousGuildName: string;
    previousGuildPrefix: string;
    currentGuildName: string;
    currentGuildPrefix: string;
  }>;
  stateBlob: { created: number; updated: number; cleared: number } | null;
  ecoSnapshotSaved: boolean;
  baseGeneration: { created: number; updated: number };
};

function datesMatch(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}

function hasStoredMemberChanges(
  snapshot: GuildRaidSnapshot,
  storedMember: StoredRaidMember,
): boolean {
  return (
    snapshot.username !== storedMember.username ||
    snapshot.wars !== storedMember.wars ||
    snapshot.total !== storedMember.totalRaids ||
    snapshot.notg !== storedMember.notgRaids ||
    snapshot.nol !== storedMember.nolRaids ||
    snapshot.tcc !== storedMember.tccRaids ||
    snapshot.tna !== storedMember.tnaRaids ||
    snapshot.twp !== storedMember.twpRaids ||
    snapshot.gambitsUsed !== storedMember.gambitsUsed ||
    snapshot.contributed !== storedMember.contributed ||
    !datesMatch(snapshot.joinedAt, storedMember.joinedAt)
  );
}

function clampRaidSnapshotToStoredValues(
  snapshot: GuildRaidSnapshot,
  storedMember: StoredRaidValues,
): GuildRaidSnapshot {
  return {
    ...snapshot,
    wars: Math.max(snapshot.wars, storedMember.wars),
    total: Math.max(snapshot.total, storedMember.totalRaids),
    notg: Math.max(snapshot.notg, storedMember.notgRaids),
    nol: Math.max(snapshot.nol, storedMember.nolRaids),
    tcc: Math.max(snapshot.tcc, storedMember.tccRaids),
    tna: Math.max(snapshot.tna, storedMember.tnaRaids),
    twp: Math.max(snapshot.twp, storedMember.twpRaids),
    gambitsUsed: Math.max(snapshot.gambitsUsed, storedMember.gambitsUsed),
  };
}

function getSnapshotHour(date = new Date()): Date {
  const snapshotHour = new Date(date);
  snapshotHour.setUTCMinutes(0, 0, 0);
  return snapshotHour;
}

function getGuildTomeWeeklySnapshotAnchor(date = new Date()): Date {
  const anchor = new Date(date);
  const dayOffset = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - dayOffset);
  anchor.setUTCHours(4, 0, 0, 0);
  return anchor;
}

function getDueGuildTomeWeeklySnapshotAnchor(date = new Date()): Date | null {
  const anchor = getGuildTomeWeeklySnapshotAnchor(date);
  return Math.abs(date.getTime() - anchor.getTime()) <= RAID_SYNC_INTERVAL_MS
    ? anchor
    : null;
}

function isEligibleForRaidCheck(
  member: { online: boolean; lastJoinAt: Date | null },
  referenceTimeMs: number,
): boolean {
  return (
    member.online ||
    (member.lastJoinAt !== null &&
      referenceTimeMs - member.lastJoinAt.getTime() <= RAID_RECENTLY_ONLINE_GRACE_MS)
  );
}

function formatSignedDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatDiscordName(value: string): string {
  return `\`${value.replace(/`/g, "'")}\``;
}

async function runInBatches<T>(
  items: readonly T[],
  batchSize: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map((item) => task(item)));
  }
}

function getRaidDeltas(snapshot: GuildRaidSnapshot, storedMember: StoredRaidValues) {
  return {
    wars: snapshot.wars - storedMember.wars,
    total: snapshot.total - storedMember.totalRaids,
    notg: snapshot.notg - storedMember.notgRaids,
    nol: snapshot.nol - storedMember.nolRaids,
    tcc: snapshot.tcc - storedMember.tccRaids,
    tna: snapshot.tna - storedMember.tnaRaids,
    twp: snapshot.twp - storedMember.twpRaids,
  };
}

function buildChangeLine(snapshot: GuildRaidSnapshot, storedMember: StoredRaidValues): string {
  const deltas = getRaidDeltas(snapshot, storedMember);
  const changeText = RAID_DELTAS
    .map((raid) => [raid.label, deltas[raid.key]] as const)
    .filter(([, value]) => value !== 0)
    .map(([label, value]) => `${formatSignedDelta(value)} ${label}`)
    .join(" ");

  return `${formatDiscordName(snapshot.username)}: ${changeText} (Total ${formatSignedDelta(deltas.total)})`;
}

function buildRaidChange(
  snapshot: GuildRaidSnapshot,
  storedMember: StoredRaidMember,
): GuildRaidSyncChange {
  return {
    uuid: snapshot.uuid,
    username: snapshot.username,
    previousUsername: storedMember.username,
    deltas: getRaidDeltas(snapshot, storedMember),
    current: {
      wars: snapshot.wars,
      total: snapshot.total,
      notg: snapshot.notg,
      nol: snapshot.nol,
      tcc: snapshot.tcc,
      tna: snapshot.tna,
      twp: snapshot.twp,
    },
    line: buildChangeLine(snapshot, storedMember),
  };
}

async function storeGuildTomeWeeklySnapshotsIfDue(
  tomeSnapshots: GuildTomeSnapshot[],
  date = new Date(),
): Promise<number> {
  const snapshotAt = getDueGuildTomeWeeklySnapshotAnchor(date);

  if (snapshotAt === null || tomeSnapshots.length === 0) {
    return 0;
  }

  const existingRows = await prisma.guildTomeWeeklySnapshot.findMany({
    where: {
      snapshotAt,
      memberUuid: {
        in: tomeSnapshots.map((snapshot) => snapshot.uuid),
      },
    },
    select: {
      memberUuid: true,
    },
  });
  const existingMemberUuids = new Set(existingRows.map((row) => row.memberUuid));
  const rowsToInsert = tomeSnapshots.filter(
    (snapshot) => !existingMemberUuids.has(snapshot.uuid),
  );

  if (rowsToInsert.length === 0) {
    return 0;
  }

  const result = await prisma.guildTomeWeeklySnapshot.createMany({
    data: rowsToInsert.map((snapshot) => ({
      snapshotAt,
      memberUuid: snapshot.uuid,
      username: snapshot.username,
      playtimeHours: snapshot.playtimeHours,
      wars: snapshot.wars,
      totalRaids: snapshot.total,
    })),
  });

  return result.count;
}

export async function syncGuildRaidsFromApiRequest(
  reason: string,
): Promise<GuildRaidSyncResult> {
  const { roster, snapshots, tomeSnapshots } = await fetchGuildRaidTrackingData();
  const snapshotHour = getSnapshotHour();
  const raidCheckReferenceTimeMs = Date.now();
  const eligibleRaidCheckMemberUuids = roster
    .filter((member) => isEligibleForRaidCheck(member, raidCheckReferenceTimeMs))
    .map((member) => member.uuid);

  const [storedMembers, storedEligibleMembers] = await Promise.all([
    prisma.guildRaidMember.findMany({
      select: {
        uuid: true,
        username: true,
        lastSeenOnlineAt: true,
      },
    }),
    eligibleRaidCheckMemberUuids.length > 0
      ? prisma.guildRaidMember.findMany({
          where: {
            uuid: {
              in: eligibleRaidCheckMemberUuids,
            },
          },
          select: {
            uuid: true,
            username: true,
            wars: true,
            totalRaids: true,
            notgRaids: true,
            nolRaids: true,
            tccRaids: true,
            tnaRaids: true,
            twpRaids: true,
            gambitsUsed: true,
            contributed: true,
            joinedAt: true,
            lastSeenOnlineAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const storedPresenceByUuid = new Map(storedMembers.map((member) => [member.uuid, member]));
  const storedByUuid = new Map(storedEligibleMembers.map((member) => [member.uuid, member]));
  const rosterUuids = new Set(roster.map((member) => member.uuid));
  const normalizedSnapshots = snapshots.map((snapshot) => {
    const storedMember = storedByUuid.get(snapshot.uuid);
    return storedMember ? clampRaidSnapshotToStoredValues(snapshot, storedMember) : snapshot;
  });

  const missingMembers = normalizedSnapshots.filter(
    (snapshot) => !storedPresenceByUuid.has(snapshot.uuid),
  );
  const membersToUpdate = normalizedSnapshots.filter((snapshot) => {
    const storedMember = storedByUuid.get(snapshot.uuid);
    return storedMember ? hasStoredMemberChanges(snapshot, storedMember) : false;
  });
  const changes = membersToUpdate
    .map((snapshot) => {
      const storedMember = storedByUuid.get(snapshot.uuid);
      return storedMember ? buildRaidChange(snapshot, storedMember) : null;
    })
    .filter((change): change is GuildRaidSyncChange => change !== null)
    .filter((change) =>
      Object.values(change.deltas).some((value) => value !== 0),
    );

  const existingSnapshotRows =
    normalizedSnapshots.length === 0
      ? []
      : await prisma.guildRaidMemberHourlySnapshot.findMany({
          where: {
            snapshotHour,
            memberUuid: {
              in: normalizedSnapshots.map((snapshot) => snapshot.uuid),
            },
          },
          select: {
            memberUuid: true,
          },
        });
  const existingSnapshotMemberUuids = new Set(
    existingSnapshotRows.map((row) => row.memberUuid),
  );
  const snapshotsToInsert = normalizedSnapshots.filter(
    (snapshot) => !existingSnapshotMemberUuids.has(snapshot.uuid),
  );

  const operations = [];

  if (missingMembers.length > 0) {
    operations.push(
      prisma.guildRaidMember.createMany({
        data: missingMembers.map((snapshot) => ({
          uuid: snapshot.uuid,
          username: snapshot.username,
          wars: snapshot.wars,
          totalRaids: snapshot.total,
          notgRaids: snapshot.notg,
          nolRaids: snapshot.nol,
          tccRaids: snapshot.tcc,
          tnaRaids: snapshot.tna,
          twpRaids: snapshot.twp,
          gambitsUsed: snapshot.gambitsUsed,
          contributed: snapshot.contributed,
          joinedAt: snapshot.joinedAt,
        })),
      }),
    );
  }

  operations.push(
    ...membersToUpdate.map((snapshot) =>
      prisma.guildRaidMember.update({
        where: {
          uuid: snapshot.uuid,
        },
        data: {
          username: snapshot.username,
          wars: snapshot.wars,
          totalRaids: snapshot.total,
          notgRaids: snapshot.notg,
          nolRaids: snapshot.nol,
          tccRaids: snapshot.tcc,
          tnaRaids: snapshot.tna,
          twpRaids: snapshot.twp,
          gambitsUsed: snapshot.gambitsUsed,
          contributed: snapshot.contributed,
          joinedAt: snapshot.joinedAt,
        },
      }),
    ),
  );

  if (snapshotsToInsert.length > 0) {
    operations.push(
      prisma.guildRaidMemberHourlySnapshot.createMany({
        data: snapshotsToInsert.map((snapshot) => ({
          snapshotHour,
          memberUuid: snapshot.uuid,
          username: snapshot.username,
          wars: snapshot.wars,
          totalRaids: snapshot.total,
          notgRaids: snapshot.notg,
          nolRaids: snapshot.nol,
          tccRaids: snapshot.tcc,
          tnaRaids: snapshot.tna,
          twpRaids: snapshot.twp,
          gambitsUsed: snapshot.gambitsUsed,
          contributed: snapshot.contributed,
          joinedAt: snapshot.joinedAt,
        })),
      }),
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations, SYNC_TRANSACTION_OPTIONS);
  }

  const tomeRowsInserted = await storeGuildTomeWeeklySnapshotsIfDue(tomeSnapshots);

  return {
    ok: true,
    reason,
    snapshotHour: snapshotHour.toISOString(),
    rosterMembers: roster.length,
    fetchedSnapshots: snapshots.length,
    inserted: missingMembers.length,
    updated: membersToUpdate.length,
    snapshotRowsInserted: snapshotsToInsert.length,
    tomeRowsInserted,
    leftGuildWarnings: storedMembers
      .filter((member) => !rosterUuids.has(member.uuid))
      .map((member) => ({
        uuid: member.uuid,
        username: member.username,
      })),
    changes,
  };
}

function normalizeGuildPrefix(prefix: string): string {
  return prefix.trim().toLowerCase();
}

function serializeTerritoryStates(territories: TerritoryState[]): string {
  return JSON.stringify(
    territories.map((territory) => ({
      ...territory,
      resources: territory.resources.map((resource) => ({ ...resource })),
      links: [...territory.links],
    })),
  );
}

function groupTerritoriesByGuild(territories: TerritoryState[]): GroupedGuildTerritoryRow[] {
  const groupedTerritories = new Map<string, TerritoryState[]>();

  for (const territory of territories) {
    const guildPrefixLower = normalizeGuildPrefix(territory.guildPrefix);
    const existing = groupedTerritories.get(guildPrefixLower) ?? [];
    existing.push(territory);
    groupedTerritories.set(guildPrefixLower, existing);
  }

  return Array.from(groupedTerritories.entries())
    .map(([guildPrefixLower, guildTerritories]) => ({
      key: guildTerritories[0]?.guildUuid ?? guildPrefixLower,
      guildUuid: guildTerritories[0]?.guildUuid ?? "",
      guildName: guildTerritories[0]?.guildName ?? "",
      guildPrefix: guildTerritories[0]?.guildPrefix ?? "",
      guildPrefixLower,
      territoriesJson: serializeTerritoryStates(guildTerritories),
    }))
    .sort((left, right) => left.guildPrefixLower.localeCompare(right.guildPrefixLower));
}

function getTerritoryBaseGeneration(territory: TerritoryState): TerritoryBaseGenerationRow {
  const getBaseValue = (resourceType: TerritoryState["resources"][number]["type"]): number =>
    territory.resources.find((resource) => resource.type === resourceType)?.baseGeneration ?? 0;

  return {
    territoryName: territory.territoryName,
    emerald: getBaseValue("EMERALD"),
    wood: getBaseValue("WOOD"),
    fish: getBaseValue("FISH"),
    ore: getBaseValue("ORE"),
    crop: getBaseValue("CROP"),
  };
}

function baseGenerationRowsMatch(
  left: TerritoryBaseGenerationRow,
  right: TerritoryBaseGenerationRow,
): boolean {
  return (
    left.emerald === right.emerald &&
    left.wood === right.wood &&
    left.fish === right.fish &&
    left.ore === right.ore &&
    left.crop === right.crop
  );
}

function territoryChanged(stored: StoredTerritoryRow, territory: TerritoryState): boolean {
  return (
    stored.guildUuid !== territory.guildUuid ||
    stored.guildName !== territory.guildName ||
    stored.guildPrefix !== territory.guildPrefix ||
    stored.hqTerritoryName !== territory.hqTerritoryName ||
    stored.startX !== territory.startX ||
    stored.startZ !== territory.startZ ||
    stored.endX !== territory.endX ||
    stored.endZ !== territory.endZ ||
    stored.isHq !== territory.isHq ||
    stored.treasury !== territory.treasury ||
    stored.defences !== territory.defences
  );
}

function isTargetGuild(guild: { guildName: string; guildPrefix: string }): boolean {
  return (
    guild.guildPrefix.toLowerCase() === TARGET_GUILD_PREFIX.toLowerCase() ||
    guild.guildName.toLowerCase() === TARGET_GUILD_NAME.toLowerCase()
  );
}

async function syncCurrentTerritoryStateSnapshotsAtTick(
  territories: TerritoryState[],
  territoryTick: Date,
): Promise<{ created: number; updated: number; cleared: number } | null> {
  const startedAt = Date.now();
  const existingRows: TerritoryCurrentStateBlob[] = await prisma.territoryCurrentStateBlob.findMany();
  const latestTakenAt = existingRows.reduce<Date | null>(
    (latest, row) =>
      latest === null || row.takenAt.getTime() > latest.getTime() ? row.takenAt : latest,
    null,
  );

  if (latestTakenAt && latestTakenAt.getTime() === territoryTick.getTime()) {
    return null;
  }

  const groupedTerritories = groupTerritoriesByGuild(territories);
  const existingByKey = new Map<string, TerritoryCurrentStateBlob>(
    existingRows.map((row): [string, TerritoryCurrentStateBlob] => [row.key, row]),
  );
  const newRows = groupedTerritories.filter((group) => !existingByKey.has(group.key));
  const changedRows = groupedTerritories.filter((group) => {
    const existing = existingByKey.get(group.key);
    return (
      existing !== undefined &&
      (existing.guildUuid !== group.guildUuid ||
        existing.guildName !== group.guildName ||
        existing.guildPrefix !== group.guildPrefix ||
        existing.guildPrefixLower !== group.guildPrefixLower ||
        existing.territoriesJson !== group.territoriesJson)
    );
  });
  const staleRows = existingRows.filter(
    (row: TerritoryCurrentStateBlob) =>
      !groupedTerritories.some((group) => group.key === row.key) &&
      row.territoriesJson !== "[]",
  );

  if (newRows.length > 0) {
    await prisma.territoryCurrentStateBlob.createMany({
      data: newRows.map((group) => ({
        key: group.key,
        guildUuid: group.guildUuid,
        guildName: group.guildName,
        guildPrefix: group.guildPrefix,
        guildPrefixLower: group.guildPrefixLower,
        takenAt: territoryTick,
        territoriesJson: group.territoriesJson,
      })),
    });
  }

  await runInBatches(changedRows, WRITE_BATCH_SIZE, async (group) => {
    await prisma.territoryCurrentStateBlob.update({
      where: {
        key: group.key,
      },
      data: {
        guildUuid: group.guildUuid,
        guildName: group.guildName,
        guildPrefix: group.guildPrefix,
        guildPrefixLower: group.guildPrefixLower,
        takenAt: territoryTick,
        territoriesJson: group.territoriesJson,
      },
    });
  });

  await runInBatches(staleRows, WRITE_BATCH_SIZE, async (row) => {
    await prisma.territoryCurrentStateBlob.update({
      where: {
        key: row.key,
      },
      data: {
        takenAt: territoryTick,
        territoriesJson: "[]",
      },
    });
  });

  logInfo(
    `territory.current-state tick=${territoryTick.toISOString()} created=${newRows.length} updated=${changedRows.length} cleared=${staleRows.length} duration=${Date.now() - startedAt}ms`,
  );

  return {
    created: newRows.length,
    updated: changedRows.length,
    cleared: staleRows.length,
  };
}

async function saveTerritoryEcoSnapshotAtTick(
  territories: TerritoryState[],
  territoryTick: Date,
): Promise<boolean> {
  const startedAt = Date.now();
  const mostRecentSnapshot = await prisma.territoryEcoSnapshotBlob.findFirst({
    orderBy: {
      takenAt: "desc",
    },
  });

  if (mostRecentSnapshot && mostRecentSnapshot.takenAt.getTime() === territoryTick.getTime()) {
    return false;
  }

  const groupedTerritories = groupTerritoriesByGuild(territories);
  if (groupedTerritories.length > 0) {
    await prisma.territoryEcoSnapshotBlob.createMany({
      data: groupedTerritories.map((group) => ({
        takenAt: territoryTick,
        guildUuid: group.guildUuid,
        guildName: group.guildName,
        guildPrefix: group.guildPrefix,
        guildPrefixLower: group.guildPrefixLower,
        territoriesJson: group.territoriesJson,
      })),
    });
  }

  await prisma.territoryEcoSnapshotBlob.deleteMany({
    where: {
      takenAt: {
        lt: new Date(territoryTick.getTime() - TERRITORY_SNAPSHOT_RETENTION_MS),
      },
    },
  });

  logInfo(
    `territory.eco-snapshot tick=${territoryTick.toISOString()} groups=${groupedTerritories.length} duration=${Date.now() - startedAt}ms`,
  );

  return true;
}

function buildTerritorySyncResult(
  territorySnapshot: FetchedTerritoryStateSnapshot,
  result: Omit<TerritorySyncResult, "ok" | "fetchedAt" | "territoryLastTick" | "territoryCount">,
): TerritorySyncResult {
  return {
    ok: true,
    fetchedAt: territorySnapshot.fetchedAt.toISOString(),
    territoryLastTick: territorySnapshot.territoryLastTick?.toISOString() ?? null,
    territoryCount: territorySnapshot.territories.length,
    ...result,
  };
}

export async function syncTerritoriesFromApiRequest(): Promise<TerritorySyncResult> {
  const syncStartedAt = Date.now();
  const territorySnapshot = await fetchTerritoryStateSnapshot();
  const currentTerritories = territorySnapshot.territories;

  logInfo(
    `territory.sync fetch territories=${currentTerritories.length} tick=${territorySnapshot.territoryLastTick?.toISOString() ?? "none"} duration=${Date.now() - syncStartedAt}ms`,
  );

  if (currentTerritories.length === 0) {
    return buildTerritorySyncResult(territorySnapshot, {
      created: 0,
      updated: 0,
      deleted: 0,
      captured: [],
      lost: [],
      stateBlob: null,
      ecoSnapshotSaved: false,
      baseGeneration: { created: 0, updated: 0 },
    });
  }

  const [storedStateTerritories, storedBaseGenerationRows]: [
    GuildTerritoryState[],
    GuildTerritoryBaseGeneration[],
  ] = await Promise.all([
    prisma.guildTerritoryState.findMany(),
    prisma.guildTerritoryBaseGeneration.findMany(),
  ]);
  const diffStartedAt = Date.now();
  const storedByName = new Map<string, GuildTerritoryState>(
    storedStateTerritories.map((territory: GuildTerritoryState) => [
      territory.territoryName,
      territory,
    ]),
  );
  const currentByName = new Map<string, TerritoryState>(
    currentTerritories.map((territory: TerritoryState) => [territory.territoryName, territory]),
  );
  const storedBaseGenerationByName = new Map<string, GuildTerritoryBaseGeneration>(
    storedBaseGenerationRows.map((row: GuildTerritoryBaseGeneration) => [
      row.territoryName,
      row,
    ]),
  );

  const newTerritories = currentTerritories.filter(
    (territory) => !storedByName.has(territory.territoryName),
  );
  const changedTerritories = currentTerritories.filter((territory) => {
    const stored = storedByName.get(territory.territoryName);
    return stored !== undefined && territoryChanged(stored, territory);
  });
  const deletedTerritories = storedStateTerritories.filter(
    (territory) => !currentByName.has(territory.territoryName),
  );
  const captured = currentTerritories
    .filter((territory: TerritoryState) => {
      const stored = storedByName.get(territory.territoryName);
      return (
        stored !== undefined &&
        isTargetGuild(territory) &&
        !isTargetGuild(stored) &&
        stored.guildUuid !== territory.guildUuid
      );
    })
    .map((territory: TerritoryState) => {
      const stored = storedByName.get(territory.territoryName);
      return {
        territoryName: territory.territoryName,
        previousGuildName: stored?.guildName ?? "Unknown",
        previousGuildPrefix: stored?.guildPrefix ?? "???",
        currentGuildName: territory.guildName,
        currentGuildPrefix: territory.guildPrefix,
      };
    });
  const lost = storedStateTerritories
    .filter((territory: GuildTerritoryState) => {
      const current = currentByName.get(territory.territoryName);
      return (
        current !== undefined &&
        isTargetGuild(territory) &&
        !isTargetGuild(current) &&
        current.guildUuid !== territory.guildUuid
      );
    })
    .map((territory: GuildTerritoryState) => {
      const current = currentByName.get(territory.territoryName);
      return {
        territoryName: territory.territoryName,
        previousGuildName: territory.guildName,
        previousGuildPrefix: territory.guildPrefix,
        currentGuildName: current?.guildName ?? "Unknown",
        currentGuildPrefix: current?.guildPrefix ?? "???",
      };
    });

  const currentBaseGenerationRows = currentTerritories.map(getTerritoryBaseGeneration);
  const newBaseGenerationRows = currentBaseGenerationRows.filter(
    (row) => !storedBaseGenerationByName.has(row.territoryName),
  );
  const changedBaseGenerationRows = currentBaseGenerationRows.filter((row) => {
    const stored = storedBaseGenerationByName.get(row.territoryName);
    return stored !== undefined && !baseGenerationRowsMatch(stored, row);
  });

  logInfo(
    `territory.sync diff new=${newTerritories.length} changed=${changedTerritories.length} deleted=${deletedTerritories.length} baseNew=${newBaseGenerationRows.length} baseChanged=${changedBaseGenerationRows.length} duration=${Date.now() - diffStartedAt}ms`,
  );

  const writeStartedAt = Date.now();
  if (newTerritories.length > 0) {
    await prisma.guildTerritoryState.createMany({
      data: newTerritories.map((territory) => ({
        territoryName: territory.territoryName,
        guildUuid: territory.guildUuid,
        guildName: territory.guildName,
        guildPrefix: territory.guildPrefix,
        hqTerritoryName: territory.hqTerritoryName,
        startX: territory.startX,
        startZ: territory.startZ,
        endX: territory.endX,
        endZ: territory.endZ,
        isHq: territory.isHq,
        treasury: territory.treasury,
        defences: territory.defences,
      })),
    });
  }

  await runInBatches(changedTerritories, WRITE_BATCH_SIZE, async (territory) => {
    await prisma.guildTerritoryState.update({
      where: {
        territoryName: territory.territoryName,
      },
      data: {
        guildUuid: territory.guildUuid,
        guildName: territory.guildName,
        guildPrefix: territory.guildPrefix,
        hqTerritoryName: territory.hqTerritoryName,
        startX: territory.startX,
        startZ: territory.startZ,
        endX: territory.endX,
        endZ: territory.endZ,
        isHq: territory.isHq,
        treasury: territory.treasury,
        defences: territory.defences,
      },
    });
  });

  if (newBaseGenerationRows.length > 0) {
    await prisma.guildTerritoryBaseGeneration.createMany({
      data: newBaseGenerationRows,
    });
  }

  await runInBatches(changedBaseGenerationRows, WRITE_BATCH_SIZE, async (row) => {
    await prisma.guildTerritoryBaseGeneration.update({
      where: {
        territoryName: row.territoryName,
      },
      data: {
        emerald: row.emerald,
        wood: row.wood,
        fish: row.fish,
        ore: row.ore,
        crop: row.crop,
      },
    });
  });

  if (deletedTerritories.length > 0) {
    await prisma.guildTerritoryState.deleteMany({
      where: {
        territoryName: {
          in: deletedTerritories.map((territory: GuildTerritoryState) => territory.territoryName),
        },
      },
    });
  }

  logInfo(
    `territory.sync db-write created=${newTerritories.length} updated=${changedTerritories.length} deleted=${deletedTerritories.length} baseCreated=${newBaseGenerationRows.length} baseUpdated=${changedBaseGenerationRows.length} duration=${Date.now() - writeStartedAt}ms`,
  );

  const territoryTick = territorySnapshot.territoryLastTick;
  const snapshotStartedAt = Date.now();
  const [stateBlob, ecoSnapshotSaved] = territoryTick
    ? await Promise.all([
        syncCurrentTerritoryStateSnapshotsAtTick(currentTerritories, territoryTick),
        saveTerritoryEcoSnapshotAtTick(currentTerritories, territoryTick),
      ])
    : [null, false] as const;

  logInfo(
    `territory.sync snapshot-write tick=${territoryTick?.toISOString() ?? "none"} stateBlob=${stateBlob ? `created:${stateBlob.created},updated:${stateBlob.updated},cleared:${stateBlob.cleared}` : "skipped"} ecoSnapshotSaved=${ecoSnapshotSaved} duration=${Date.now() - snapshotStartedAt}ms`,
  );

  logInfo(`territory.sync total duration=${Date.now() - syncStartedAt}ms`);

  return buildTerritorySyncResult(territorySnapshot, {
    created: newTerritories.length,
    updated: changedTerritories.length,
    deleted: deletedTerritories.length,
    captured,
    lost,
    stateBlob,
    ecoSnapshotSaved,
    baseGeneration: {
      created: newBaseGenerationRows.length,
      updated: changedBaseGenerationRows.length,
    },
  });
}
