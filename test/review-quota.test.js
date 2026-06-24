import test from "node:test";
import assert from "node:assert/strict";
import {
  checkQuota,
  incrementQuota,
  createInMemoryStorage,
  getMaxReviewsPerDay,
  quotaStorageKey,
  getDateKey,
} from "../src/core/review-quota.js";

test("default max is 5", () => {
  assert.equal(getMaxReviewsPerDay({}), 5);
});

test("env override accepts positive integers", () => {
  assert.equal(getMaxReviewsPerDay({ MAX_REVIEWS_PER_ISSUE_PER_DAY: "10" }), 10);
});

test("env override ignores invalid values and falls back to 5", () => {
  assert.equal(getMaxReviewsPerDay({ MAX_REVIEWS_PER_ISSUE_PER_DAY: "abc" }), 5);
  assert.equal(getMaxReviewsPerDay({ MAX_REVIEWS_PER_ISSUE_PER_DAY: "0" }), 5);
  assert.equal(getMaxReviewsPerDay({ MAX_REVIEWS_PER_ISSUE_PER_DAY: "-1" }), 5);
});

test("storage key includes issue key and JST date", () => {
  const date = new Date("2026-06-24T15:00:00Z"); // 2026-06-25 00:00 JST
  const key = quotaStorageKey("JPREQ-123", date);
  assert.equal(key, "review-quota:JPREQ-123:2026-06-25");
});

test("date key resets at JST midnight, not UTC midnight", () => {
  const jstLateNight = new Date("2026-06-24T14:59:00Z"); // 23:59 JST 6/24
  const jstAfterMidnight = new Date("2026-06-24T15:01:00Z"); // 00:01 JST 6/25
  assert.equal(getDateKey(jstLateNight), "2026-06-24");
  assert.equal(getDateKey(jstAfterMidnight), "2026-06-25");
});

test("checkQuota returns allowed=true when under limit", async () => {
  const storage = createInMemoryStorage();
  const result = await checkQuota(storage, "JPREQ-1", { env: {} });
  assert.equal(result.allowed, true);
  assert.equal(result.current, 0);
  assert.equal(result.max, 5);
});

test("incrementQuota increments and persists", async () => {
  const storage = createInMemoryStorage();
  const now = new Date("2026-06-24T01:00:00Z");
  await incrementQuota(storage, "JPREQ-1", { now });
  await incrementQuota(storage, "JPREQ-1", { now });
  const result = await checkQuota(storage, "JPREQ-1", { env: {}, now });
  assert.equal(result.current, 2);
  assert.equal(result.allowed, true);
});

test("checkQuota blocks after reaching limit", async () => {
  const storage = createInMemoryStorage();
  const now = new Date("2026-06-24T01:00:00Z");
  const env = { MAX_REVIEWS_PER_ISSUE_PER_DAY: "3" };
  for (let i = 0; i < 3; i++) {
    const before = await checkQuota(storage, "JPREQ-1", { env, now });
    assert.equal(before.allowed, true, `iteration ${i} should be allowed`);
    await incrementQuota(storage, "JPREQ-1", { env, now });
  }
  const after = await checkQuota(storage, "JPREQ-1", { env, now });
  assert.equal(after.allowed, false);
  assert.equal(after.current, 3);
  assert.equal(after.max, 3);
});

test("quota counters are isolated per issue key", async () => {
  const storage = createInMemoryStorage();
  const now = new Date("2026-06-24T01:00:00Z");
  await incrementQuota(storage, "JPREQ-1", { now });
  await incrementQuota(storage, "JPREQ-1", { now });
  const other = await checkQuota(storage, "JPREQ-2", { env: {}, now });
  assert.equal(other.current, 0);
});

test("quota counters are isolated per JST day", async () => {
  const storage = createInMemoryStorage();
  const day1 = new Date("2026-06-24T01:00:00Z"); // 10:00 JST 6/24
  const day2 = new Date("2026-06-25T01:00:00Z"); // 10:00 JST 6/25
  await incrementQuota(storage, "JPREQ-1", { now: day1 });
  await incrementQuota(storage, "JPREQ-1", { now: day1 });
  const tomorrow = await checkQuota(storage, "JPREQ-1", { env: {}, now: day2 });
  assert.equal(tomorrow.current, 0);
  assert.equal(tomorrow.allowed, true);
});
