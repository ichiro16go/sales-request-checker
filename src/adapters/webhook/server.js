#!/usr/bin/env node
import { createServer } from "node:http";
import { normalizeIssue } from "../../core/checker.js";
import { isAllowedIssueKey } from "../../core/project-filter.js";
import { formatReviewComment, reviewIssueSnapshot } from "../../core/review.js";
import { loadDotenv } from "../cli/env.js";
import { JiraBasicClient } from "./jira-basic-client.js";

loadDotenv();

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function authorized(req) {
  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (!secret) return true;
  return req.headers["x-sales-request-secret"] === secret;
}

async function reviewFromPayload(payload) {
  const client = new JiraBasicClient();
  const key = payload.issue?.key || payload.key || payload.ticket_key;
  const issue = payload.issue?.fields ? payload.issue : await client.getIssue(String(key || "").toUpperCase());
  const snapshot = normalizeIssue(issue);
  if (!isAllowedIssueKey(snapshot.key)) {
    throw new Error(`Unsupported issue key: ${snapshot.key}`);
  }
  const review = await reviewIssueSnapshot(snapshot);
  const comment = formatReviewComment(review);
  if (payload.post !== false) await client.addComment(snapshot.key, comment);
  return { key: snapshot.key, review, posted: payload.post !== false };
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method !== "POST" || req.url !== "/jira-automation/review") {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  try {
    const payload = await readJson(req);
    const result = await reviewFromPayload(payload);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Webhook adapter listening on http://${host}:${port}`);
});
