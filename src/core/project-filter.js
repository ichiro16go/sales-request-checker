export function allowedProjectKeys(env = process.env) {
  return (env.ALLOWED_PROJECT_KEYS || "JPREQ")
    .split(",")
    .map((key) => key.trim().toUpperCase())
    .filter(Boolean);
}

export function isAllowedIssueKey(issueKey, env = process.env) {
  const key = String(issueKey || "").toUpperCase();
  return allowedProjectKeys(env).some((projectKey) => key.startsWith(`${projectKey}-`));
}
