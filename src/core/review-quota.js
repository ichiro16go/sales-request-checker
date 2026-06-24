const DEFAULT_MAX_REVIEWS_PER_DAY = 5;

export function getMaxReviewsPerDay(env = process.env) {
  const raw = env?.MAX_REVIEWS_PER_ISSUE_PER_DAY;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_MAX_REVIEWS_PER_DAY;
}

export function getDateKey(date = new Date(), timeZone = "Asia/Tokyo") {
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function quotaStorageKey(issueKey, date = new Date(), timeZone = "Asia/Tokyo") {
  return `review-quota:${issueKey}:${getDateKey(date, timeZone)}`;
}

export async function checkQuota(storage, issueKey, options = {}) {
  const env = options.env || process.env;
  const now = options.now || new Date();
  const max = options.max ?? getMaxReviewsPerDay(env);
  const key = quotaStorageKey(issueKey, now);
  const raw = await storage.get(key);
  const current = Number.isFinite(Number(raw)) ? Number(raw) : 0;
  return { allowed: current < max, current, max, key };
}

export async function incrementQuota(storage, issueKey, options = {}) {
  const now = options.now || new Date();
  const key = quotaStorageKey(issueKey, now);
  const raw = await storage.get(key);
  const current = Number.isFinite(Number(raw)) ? Number(raw) : 0;
  const next = current + 1;
  await storage.set(key, next);
  return next;
}

export function createInMemoryStorage() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? map.get(key) : undefined; },
    async set(key, value) { map.set(key, value); return value; },
  };
}
