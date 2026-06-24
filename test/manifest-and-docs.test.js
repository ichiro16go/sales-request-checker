import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

async function readRepoFile(relativePath) {
  return await readFile(join(repoRoot, relativePath), "utf8");
}

test("manifest.yml declares storage:app scope for review-quota counter", async () => {
  const manifest = await readRepoFile("manifest.yml");
  assert.match(
    manifest,
    /scopes:[\s\S]*-\s+storage:app/,
    "storage:app scope must be declared in manifest.yml so MAX_REVIEWS_PER_ISSUE_PER_DAY can persist via Forge storage",
  );
});

test("manifest.yml still declares jira read/write scopes", async () => {
  const manifest = await readRepoFile("manifest.yml");
  assert.match(manifest, /-\s+read:jira-work/);
  assert.match(manifest, /-\s+write:jira-work/);
});

test("manifest.yml restricts external fetch to api.openai.com only", async () => {
  const manifest = await readRepoFile("manifest.yml");
  assert.match(manifest, /-\s+address:\s+https:\/\/api\.openai\.com/);
});

test("README documents MAX_REVIEWS_PER_ISSUE_PER_DAY env variable", async () => {
  const readme = await readRepoFile("README.md");
  assert.match(readme, /MAX_REVIEWS_PER_ISSUE_PER_DAY/);
});

test("README documents MAX_DESCRIPTION_CHARS env variable", async () => {
  const readme = await readRepoFile("README.md");
  assert.match(readme, /MAX_DESCRIPTION_CHARS/);
});

test("README references docs/cost-control.md", async () => {
  const readme = await readRepoFile("README.md");
  assert.match(readme, /docs\/cost-control\.md/);
});

test(".env.example documents MAX_REVIEWS_PER_ISSUE_PER_DAY and MAX_DESCRIPTION_CHARS", async () => {
  const envExample = await readRepoFile(".env.example");
  assert.match(envExample, /MAX_REVIEWS_PER_ISSUE_PER_DAY/);
  assert.match(envExample, /MAX_DESCRIPTION_CHARS/);
});
