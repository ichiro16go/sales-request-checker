import { invoke } from "@forge/bridge";

const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const questions = document.querySelector("#questions");
const questionList = document.querySelector("#question-list");
const improved = document.querySelector("#improved");
const improvedText = document.querySelector("#improved-text");
const similar = document.querySelector("#similar");
const similarKeywords = document.querySelector("#similar-keywords");
const similarList = document.querySelector("#similar-list");
const refresh = document.querySelector("#refresh");
const post = document.querySelector("#post");

function setBusy(isBusy) {
  refresh.disabled = isBusy;
  post.disabled = isBusy;
}

function render(review, posted = false) {
  status.textContent = posted ? "Jiraコメントを投稿しました。" : "";
  summary.hidden = false;
  summary.textContent = `${review.verdictEmoji} ${review.verdictLabel}: ${review.reason}`;

  questionList.innerHTML = "";
  for (const row of review.questions || []) {
    const li = document.createElement("li");
    li.textContent = `${row.label}: ${row.question}`;
    questionList.appendChild(li);
  }
  questions.hidden = !review.questions?.length;

  improvedText.textContent = review.improvedDescription || "";
  improved.hidden = !review.improvedDescription;
}

async function loadReview() {
  setBusy(true);
  status.textContent = "レビュー中...";
  try {
    render(await invoke("getReview"));
  } catch (error) {
    status.textContent = error?.message || String(error);
  } finally {
    setBusy(false);
  }
}

async function postReview() {
  setBusy(true);
  status.textContent = "コメント投稿中...";
  try {
    render(await invoke("postReview"), true);
  } catch (error) {
    status.textContent = error?.message || String(error);
  } finally {
    setBusy(false);
  }
}

refresh.addEventListener("click", loadReview);
post.addEventListener("click", postReview);
loadReview();
loadSimilarIssues();

async function loadSimilarIssues() {
  try {
    const result = await invoke("getSimilarIssues");
    renderSimilar(result);
  } catch (error) {
    console.warn("類似チケット検索エラー:", error);
  }
}

function renderSimilar(result) {
  if (!result?.issues?.length) {
    similar.hidden = true;
    return;
  }
  similar.hidden = false;
  similarKeywords.textContent = `検索キーワード: ${result.keywords.join(", ")}`;
  similarList.innerHTML = "";
  for (const issue of result.issues) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = `/browse/${issue.key}`;
    link.target = "_blank";
    link.textContent = issue.key;
    li.appendChild(link);
    li.append(` ${issue.summary} [${issue.status}] (${issue.updated}) - ${issue.assignee}`);
    similarList.appendChild(li);
  }
}
