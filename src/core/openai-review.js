export const PROMPT_VERSION = "sales-request-review-2026-06-08";

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  const chunks = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content.text) chunks.push(content.text);
      if (content?.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonObject(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function runOpenAiReview(snapshot, ruleReview, env = process.env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return { enabled: false, provider: "none", promptVersion: PROMPT_VERSION };

  const model = env.OPENAI_MODEL || "gpt-5.2";
  const input = {
    issue: {
      key: snapshot.key,
      summary: snapshot.summary,
      description: snapshot.description,
      priority: snapshot.priority,
      dueDate: snapshot.dueDate,
      attachmentCount: snapshot.attachmentCount,
      issueLinkCount: snapshot.issueLinkCount,
    },
    ruleReview: {
      verdict: ruleReview.verdict,
      reason: ruleReview.reason,
      missingItems: ruleReview.missingItems,
    },
  };

  const instructions = [
    "あなたは営業・事業部から開発チームへのJira依頼をレビューするアシスタントです。",
    "目的は依頼者を責めることではなく、開発に必要な情報を短時間で揃えることです。",
    "日本語で、丁寧かつ具体的に書いてください。",
    "出力はJSONのみです。Markdownのコードフェンスは使わないでください。",
    "schema: {\"questions\":[{\"label\":\"string\",\"question\":\"string\"}],\"improvedDescription\":\"string\",\"reviewSummary\":\"string\",\"confidence\":0.0}",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: JSON.stringify(input),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const parsed = parseJsonObject(extractOutputText(data));
  if (!parsed) throw new Error("OpenAI response was not valid JSON");

  return {
    enabled: true,
    provider: "openai",
    model,
    promptVersion: PROMPT_VERSION,
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    improvedDescription: typeof parsed.improvedDescription === "string" ? parsed.improvedDescription : "",
    reviewSummary: typeof parsed.reviewSummary === "string" ? parsed.reviewSummary : "",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
  };
}
