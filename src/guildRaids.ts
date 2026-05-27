import { fetchWithWynncraftAuthFallback } from "./wynncraft.js";

const WYNNCRAFT_GUILD_URL = "https://api.wynncraft.com/v3/guild/prefix/ETKW";

export const PAGE_SIZE = 30;
export const PAGINATION_TIMEOUT_MS = 5 * 60 * 1000;
export const RAID_LABELS = {
  "Nest of the Grootslangs": "NOTG",
  "Orphion's Nexus of Light": "NOL",
  "The Canyon Colossus": "TCC",
  "The Nameless Anomaly": "TNA",
  "The Wartorn Palace": "TWP"
} as const;

type RaidName = keyof typeof RAID_LABELS;
export type GuildRankRoleKey =
  | "owner"
  | "chief"
  | "strategist"
  | "captain"
  | "recruiter"
  | "recruit";

type GuildRaidList = Partial<Record<RaidName, number>>;

type GuildRaidCounter = {
  total?: number | null;
  list?: GuildRaidList | Record<string, number | null> | null;
};

type GuildMemberGlobalData = {
  wars?: number | null;
  playtime?: number | null;
  guildRaids?: GuildRaidCounter | null;
  raidStats?: {
    gambitsUsed?: number | null;
  } | null;
};

type GuildMemberWeekly = {
  completed?: boolean | null;
  streak?: number | null;
};

type GuildMember = {
  uuid: string;
  online: boolean;
  server: string | null;
  contributed: number;
  guildRank?: number;
  contributionRank?: number;
  joined: string;
  lastJoin?: string | null;
  weekly?: GuildMemberWeekly | null;
  guildRaids?: GuildRaidCounter | null;
  globalData?: GuildMemberGlobalData | null;
};

type GuildMembers = {
  total: number;
  [rank: string]: number | Record<string, GuildMember>;
};

type GuildResponse = {
  members: GuildMembers;
};

export type GuildRaidSnapshot = {
  uuid: string;
  username: string;
  wars: number;
  total: number;
  notg: number;
  nol: number;
  tcc: number;
  tna: number;
  twp: number;
  gambitsUsed: number;
  contributed: bigint;
  joinedAt: Date | null;
};

export type GuildTomeSnapshot = {
  uuid: string;
  username: string;
  wars: number;
  total: number;
  playtimeHours: number;
  weeklyCompleted: boolean;
};

export type GuildMemberRosterEntry = {
  uuid: string;
  username: string;
  rank: GuildRankRoleKey;
  online: boolean;
  contributed: bigint;
  joinedAt: Date | null;
  lastJoinAt: Date | null;
};

export type GuildIntraLeaderboardEntry = {
  uuid: string;
  username: string;
  rank: GuildRankRoleKey;
  contributionRank: number | null;
  weeklyStreak: number;
  contributed: bigint;
  wars: number;
  total: number;
  notg: number;
  nol: number;
  tcc: number;
  tna: number;
  twp: number;
};

export type GuildRaidSummary = {
  username: string;
  total: number;
  notg: number;
  nol: number;
  tcc: number;
  tna: number;
  twp: number;
};

export type ColumnWidths = {
  username: number;
  total: number;
  notg: number;
  nol: number;
  tcc: number;
  tna: number;
  twp: number;
};

function sanitizeCodeBlockText(value: string): string {
  return value.replace(/`/g, "'");
}

function getMetricValue(value: number | null | undefined): number {
  return typeof value === "number" ? value : 0;
}

function getGuildRaidCount(counter: GuildRaidCounter | null | undefined, raidName: RaidName): number {
  const value = counter?.list?.[raidName];
  return typeof value === "number" ? value : 0;
}

function getGuildRaidCounter(member: GuildMember): GuildRaidCounter | null {
  return member.globalData?.guildRaids ?? member.guildRaids ?? null;
}

function isGuildRankRoleKey(value: string): value is GuildRankRoleKey {
  return (
    value === "owner" ||
    value === "chief" ||
    value === "strategist" ||
    value === "captain" ||
    value === "recruiter" ||
    value === "recruit"
  );
}

function extractGuildMembers(guild: GuildResponse): Array<{
  rank: GuildRankRoleKey;
  username: string;
  member: GuildMember;
}> {
  return Object.entries(guild.members)
    .filter(([rank]) => isGuildRankRoleKey(rank))
    .flatMap(([rank, membersByRank]) =>
      Object.entries(membersByRank as Record<string, GuildMember>).map(
        ([username, member]) => ({
          rank: rank as GuildRankRoleKey,
          username,
          member
        })
      )
    )
    .sort((left, right) => left.username.localeCompare(right.username));
}

function buildRosterEntry(
  rank: GuildRankRoleKey,
  username: string,
  member: GuildMember
): GuildMemberRosterEntry {
  return {
    uuid: member.uuid,
    username,
    rank,
    online: member.online,
    contributed: BigInt(member.contributed),
    joinedAt: member.joined ? new Date(member.joined) : null,
    lastJoinAt: member.lastJoin ? new Date(member.lastJoin) : null
  };
}

function buildSnapshot(
  rank: GuildRankRoleKey,
  username: string,
  member: GuildMember
): GuildRaidSnapshot {
  const rosterEntry = buildRosterEntry(rank, username, member);
  const guildRaids = getGuildRaidCounter(member);

  return {
    ...rosterEntry,
    wars: getMetricValue(member.globalData?.wars),
    total: getMetricValue(guildRaids?.total),
    notg: getGuildRaidCount(guildRaids, "Nest of the Grootslangs"),
    nol: getGuildRaidCount(guildRaids, "Orphion's Nexus of Light"),
    tcc: getGuildRaidCount(guildRaids, "The Canyon Colossus"),
    tna: getGuildRaidCount(guildRaids, "The Nameless Anomaly"),
    twp: getGuildRaidCount(guildRaids, "The Wartorn Palace"),
    gambitsUsed: getMetricValue(member.globalData?.raidStats?.gambitsUsed)
  };
}

function buildTomeSnapshot(
  username: string,
  member: GuildMember
): GuildTomeSnapshot {
  const guildRaids = getGuildRaidCounter(member);

  return {
    uuid: member.uuid,
    username,
    wars: getMetricValue(member.globalData?.wars),
    total: getMetricValue(guildRaids?.total),
    playtimeHours: getMetricValue(member.globalData?.playtime),
    weeklyCompleted: member.weekly?.completed === true
  };
}

function buildIntraLeaderboardEntry(
  rank: GuildRankRoleKey,
  username: string,
  member: GuildMember
): GuildIntraLeaderboardEntry {
  const guildRaids = getGuildRaidCounter(member);

  return {
    uuid: member.uuid,
    username,
    rank,
    contributionRank:
      typeof member.contributionRank === "number" ? member.contributionRank : null,
    weeklyStreak:
      typeof member.weekly?.streak === "number" ? member.weekly.streak : 0,
    contributed: BigInt(member.contributed),
    wars: getMetricValue(member.globalData?.wars),
    total: getMetricValue(guildRaids?.total),
    notg: getGuildRaidCount(guildRaids, "Nest of the Grootslangs"),
    nol: getGuildRaidCount(guildRaids, "Orphion's Nexus of Light"),
    tcc: getGuildRaidCount(guildRaids, "The Canyon Colossus"),
    tna: getGuildRaidCount(guildRaids, "The Nameless Anomaly"),
    twp: getGuildRaidCount(guildRaids, "The Wartorn Palace")
  };
}

async function fetchGuildResponse(): Promise<GuildResponse> {
  const response = await fetchWithWynncraftAuthFallback(WYNNCRAFT_GUILD_URL);

  if (!response.ok) {
    throw new Error(`Wynncraft API returned ${response.status}`);
  }

  return (await response.json()) as GuildResponse;
}

export async function fetchGuildRaidTrackingData(): Promise<{
  roster: GuildMemberRosterEntry[];
  snapshots: GuildRaidSnapshot[];
  tomeSnapshots: GuildTomeSnapshot[];
  intraLeaderboardEntries: GuildIntraLeaderboardEntry[];
}> {
  const guild = await fetchGuildResponse();
  const members = extractGuildMembers(guild);
  const roster = members.map(({ rank, username, member }) =>
    buildRosterEntry(rank, username, member)
  );
  const baseSnapshots = members.map(({ rank, username, member }) =>
    buildSnapshot(rank, username, member)
  );
  const tomeSnapshots = members.map(({ username, member }) =>
    buildTomeSnapshot(username, member)
  );
  const intraLeaderboardEntries = members.map(({ rank, username, member }) =>
    buildIntraLeaderboardEntry(rank, username, member)
  );

  return {
    roster,
    snapshots: baseSnapshots,
    tomeSnapshots,
    intraLeaderboardEntries
  };
}

export async function fetchGuildRaidSnapshots(): Promise<GuildRaidSnapshot[]> {
  return (await fetchGuildRaidTrackingData()).snapshots;
}

export async function fetchGuildTomeSnapshots(): Promise<GuildTomeSnapshot[]> {
  return (await fetchGuildRaidTrackingData()).tomeSnapshots;
}

export async function fetchGuildMemberRoster(): Promise<GuildMemberRosterEntry[]> {
  return (await fetchGuildRaidTrackingData()).roster;
}

export function buildRaidSummary(snapshot: GuildRaidSnapshot): GuildRaidSummary {
  return {
    username: sanitizeCodeBlockText(snapshot.username),
    total: snapshot.total,
    notg: snapshot.notg,
    nol: snapshot.nol,
    tcc: snapshot.tcc,
    tna: snapshot.tna,
    twp: snapshot.twp
  };
}

export function getColumnWidths(entries: GuildRaidSummary[]): ColumnWidths {
  return {
    username: Math.max("Member".length, ...entries.map((entry) => entry.username.length)),
    total: Math.max("Total".length, ...entries.map((entry) => String(entry.total).length)),
    notg: Math.max("NOTG".length, ...entries.map((entry) => String(entry.notg).length)),
    nol: Math.max("NOL".length, ...entries.map((entry) => String(entry.nol).length)),
    tcc: Math.max("TCC".length, ...entries.map((entry) => String(entry.tcc).length)),
    tna: Math.max("TNA".length, ...entries.map((entry) => String(entry.tna).length)),
    twp: Math.max("TWP".length, ...entries.map((entry) => String(entry.twp).length))
  };
}

export function formatPageTable(
  entries: GuildRaidSummary[],
  widths: ColumnWidths
): string {
  const lines = [
    [
      "Member".padEnd(widths.username),
      "Total".padStart(widths.total),
      "NOTG".padStart(widths.notg),
      "NOL".padStart(widths.nol),
      "TCC".padStart(widths.tcc),
      "TNA".padStart(widths.tna),
      "TWP".padStart(widths.twp)
    ].join(" | "),
    [
      "-".repeat(widths.username),
      "-".repeat(widths.total),
      "-".repeat(widths.notg),
      "-".repeat(widths.nol),
      "-".repeat(widths.tcc),
      "-".repeat(widths.tna),
      "-".repeat(widths.twp)
    ].join("-+-"),
    ...entries.map((entry) =>
      [
        entry.username.padEnd(widths.username),
        String(entry.total).padStart(widths.total),
        String(entry.notg).padStart(widths.notg),
        String(entry.nol).padStart(widths.nol),
        String(entry.tcc).padStart(widths.tcc),
        String(entry.tna).padStart(widths.tna),
        String(entry.twp).padStart(widths.twp)
      ].join(" | ")
    )
  ];

  return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

export function chunkEntries<T>(entries: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }

  return chunks;
}
