import type { GuildRaidSnapshot } from "./guildRaids.js";

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

export type GuildRaidSyncStoredMember = StoredRaidValues & {
  uuid: string;
  username: string;
  contributed: bigint;
  joinedAt: Date | null;
  lastSeenOnlineAt: Date | null;
};

export type GuildRaidSyncChange = {
  uuid: string;
  username: string;
  deltas: {
    wars: number;
    notg: number;
    nol: number;
    tcc: number;
    tna: number;
    twp: number;
  };
  current: {
    wars: number;
    notg: number;
    nol: number;
    tcc: number;
    tna: number;
    twp: number;
  };
};

function datesMatch(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}

function hasStoredMemberChanges(
  snapshot: GuildRaidSnapshot,
  storedMember: GuildRaidSyncStoredMember,
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

function getRaidDeltas(
  snapshot: GuildRaidSnapshot,
  storedMember: StoredRaidValues,
) {
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

function buildRaidChange(
  snapshot: GuildRaidSnapshot,
  storedMember: GuildRaidSyncStoredMember,
): GuildRaidSyncChange {
  return {
    uuid: snapshot.uuid,
    username: snapshot.username,
    deltas: getRaidDeltas(snapshot, storedMember),
    current: {
      wars: snapshot.wars,
      notg: snapshot.notg,
      nol: snapshot.nol,
      tcc: snapshot.tcc,
      tna: snapshot.tna,
      twp: snapshot.twp,
    },
  };
}

export function buildGuildRaidSyncChangesFromSnapshots(
  snapshots: GuildRaidSnapshot[],
  storedMembers: GuildRaidSyncStoredMember[],
): GuildRaidSyncChange[] {
  const storedByUuid = new Map(storedMembers.map((member) => [member.uuid, member]));

  return snapshots
    .map((snapshot) => {
      const storedMember = storedByUuid.get(snapshot.uuid);

      if (!storedMember) {
        return null;
      }

      const normalizedSnapshot = clampRaidSnapshotToStoredValues(snapshot, storedMember);

      if (!hasStoredMemberChanges(normalizedSnapshot, storedMember)) {
        return null;
      }

      return buildRaidChange(normalizedSnapshot, storedMember);
    })
    .filter((change): change is GuildRaidSyncChange => change !== null)
    .filter((change) => Object.values(change.deltas).some((value) => value !== 0));
}
