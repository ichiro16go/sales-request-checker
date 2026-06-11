import { textToAdf } from "../../core/adf.js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

export class JiraBasicClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || requireEnv("JIRA_BASE_URL")).replace(/\/$/, "");
    const email = options.email || requireEnv("JIRA_EMAIL");
    const apiToken = options.apiToken || requireEnv("JIRA_API_TOKEN");
    this.headers = {
      "Authorization": `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
  }

  async request(method, path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`Jira API ${response.status}: ${text.slice(0, 500)}`);
    }
    return data;
  }

  async getIssue(key) {
    const fields = ["summary", "description", "issuetype", "reporter", "priority", "duedate", "status", "issuelinks", "attachment"];
    const data = await this.request("POST", "/rest/api/3/search/jql", {
      jql: `key = ${key}`,
      fields,
      maxResults: 1,
    });
    const issue = data.issues?.[0];
    if (!issue) throw new Error(`Issue not found: ${key}`);
    return issue;
  }

  async addComment(key, commentText) {
    return this.request("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
      body: textToAdf(commentText),
    });
  }
}
