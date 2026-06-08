export function extractAdfText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractAdfText).filter(Boolean).join(" ");
  if (typeof node !== "object") return "";

  const parts = [];
  if (node.type === "text" && node.text) parts.push(node.text);
  if (Array.isArray(node.content)) parts.push(extractAdfText(node.content));
  return parts.filter(Boolean).join(" ");
}

/** インライン Markdown (**bold**, plain text) を ADF content 配列に変換する */
function inlineToAdf(text) {
  const nodes = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push({ type: "text", text: text.slice(last, m.index) });
    nodes.push({ type: "text", text: m[1], marks: [{ type: "strong" }] });
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.length ? nodes : [{ type: "text", text }];
}

/** Markdown テキストを ADF doc に変換する */
export function textToAdf(text) {
  const lines = String(text || "").split("\n");
  const content = [];
  let listItems = [];

  function flushList() {
    if (!listItems.length) return;
    content.push({ type: "bulletList", content: listItems });
    listItems = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    // 水平線
    if (/^---+$/.test(line)) {
      flushList();
      content.push({ type: "rule" });
      continue;
    }

    // 見出し ## / ###
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushList();
      content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: inlineToAdf(headingMatch[2]),
      });
      continue;
    }

    // 箇条書き - item
    const listMatch = line.match(/^- (.+)/);
    if (listMatch) {
      listItems.push({
        type: "listItem",
        content: [{ type: "paragraph", content: inlineToAdf(listMatch[1]) }],
      });
      continue;
    }

    // 空行 → リストを閉じる
    if (!line) {
      flushList();
      continue;
    }

    // 通常テキスト
    flushList();
    content.push({ type: "paragraph", content: inlineToAdf(line) });
  }

  flushList();

  return {
    type: "doc",
    version: 1,
    content: content.length ? content : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
  };
}
