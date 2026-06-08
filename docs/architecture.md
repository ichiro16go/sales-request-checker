# Architecture

## Product Goal

営業・事業部がJiraに起票する依頼の品質を、別UIを増やさずに上げる。

## Primary Path

ForgeをJiraにインストールし、Jira内で完結させる。

```text
Issue created
-> Forge trigger
-> src/core/review.js
-> Jira comment
-> Issue panel for rerun/post
```

## Fallback Path

Forge承認が通らない場合は、Jira Automationから外部adapterを呼ぶ。

```text
Issue created
-> Jira Automation Send web request
-> src/adapters/webhook/server.js
-> src/core/review.js
-> Jira comment
```

GitHub Actionsも同じcoreをCLIから呼ぶ。

## Shared Contract

All adapters should convert Jira data into an `IssueSnapshot` shape before reviewing.

```js
{
  key,
  summary,
  description,
  reporter,
  priority,
  dueDate,
  status,
  attachmentCount,
  issueLinkCount
}
```

The review result contains:

- verdict
- missingItems
- questions
- improvedDescription
- categories
- ai provider metadata

## LLM Strategy

OpenAI Responses API is optional. If `OPENAI_API_KEY` is not configured or the API fails, the app returns a deterministic rule-based review.

The prompt version is recorded in every review comment to make behavior changes auditable.
