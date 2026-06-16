import assert from "node:assert/strict";

import type { GuildRaidSnapshot } from "./guildRaids.js";
import {
  buildGuildRaidSyncChangesFromSnapshots,
  type GuildRaidSyncStoredMember,
} from "./syncRaidChanges.js";

function createStoredMember(
  overrides: Partial<GuildRaidSyncStoredMember> = {},
): GuildRaidSyncStoredMember {
  return {
    uuid: "member-1",
    username: "Tester",
    wars: 0,
    totalRaids: 0,
    notgRaids: 0,
    nolRaids: 0,
    tccRaids: 0,
    tnaRaids: 0,
    twpRaids: 0,
    gambitsUsed: 0,
    contributed: 0n,
    joinedAt: null,
    lastSeenOnlineAt: null,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<GuildRaidSnapshot> = {},
): GuildRaidSnapshot {
  return {
    uuid: "member-1",
    username: "Tester",
    wars: 0,
    total: 0,
    notg: 0,
    nol: 0,
    tcc: 0,
    tna: 0,
    twp: 0,
    gambitsUsed: 0,
    contributed: 0n,
    joinedAt: null,
    ...overrides,
  };
}

type TestCase = {
  name: string;
  run: () => void;
};

const testCases: TestCase[] = [
  {
    name: "single raid increase returns one API change",
    run: () => {
      const changes = buildGuildRaidSyncChangesFromSnapshots(
        [
          createSnapshot({
            total: 9,
            tna: 9,
          }),
        ],
        [
          createStoredMember({
            totalRaids: 8,
            tnaRaids: 8,
          }),
        ],
      );

      assert.equal(changes.length, 1);
      assert.equal(changes[0].uuid, "member-1");
      assert.equal(changes[0].deltas.tna, 1);
      assert.equal(changes[0].deltas.notg, 0);
      assert.equal(changes[0].current.tna, 9);
    },
  },
  {
    name: "unchanged snapshot returns no API changes",
    run: () => {
      const changes = buildGuildRaidSyncChangesFromSnapshots(
        [
          createSnapshot({
            total: 12,
            tna: 7,
            twp: 5,
          }),
        ],
        [
          createStoredMember({
            totalRaids: 12,
            tnaRaids: 7,
            twpRaids: 5,
          }),
        ],
      );

      assert.deepEqual(changes, []);
    },
  },
  {
    name: "decreases are clamped and do not emit fake negative changes",
    run: () => {
      const changes = buildGuildRaidSyncChangesFromSnapshots(
        [
          createSnapshot({
            total: 11,
            tna: 11,
          }),
        ],
        [
          createStoredMember({
            totalRaids: 12,
            tnaRaids: 12,
          }),
        ],
      );

      assert.deepEqual(changes, []);
    },
  },
  {
    name: "multiple raid increases preserve each delta",
    run: () => {
      const changes = buildGuildRaidSyncChangesFromSnapshots(
        [
          createSnapshot({
            total: 13,
            notg: 4,
            tna: 9,
          }),
        ],
        [
          createStoredMember({
            totalRaids: 10,
            notgRaids: 3,
            tnaRaids: 7,
          }),
        ],
      );

      assert.equal(changes.length, 1);
      assert.equal(changes[0].deltas.notg, 1);
      assert.equal(changes[0].deltas.tna, 2);
      assert.equal(changes[0].current.notg, 4);
      assert.equal(changes[0].current.tna, 9);
    },
  },
  {
    name: "war-only increase is still returned by the API delta builder",
    run: () => {
      const changes = buildGuildRaidSyncChangesFromSnapshots(
        [
          createSnapshot({
            wars: 15,
          }),
        ],
        [
          createStoredMember({
            wars: 14,
          }),
        ],
      );

      assert.equal(changes.length, 1);
      assert.equal(changes[0].deltas.wars, 1);
      assert.equal(changes[0].current.wars, 15);
    },
  },
];

let failures = 0;

for (const testCase of testCases) {
  try {
    testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`Passed ${testCases.length} guild raid sync API tests.`);
}
