import { invoke } from "@forge/bridge";

const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const questions = document.querySelector("#questions");
const questionList = document.querySelector("#question-list");
const improved = document.querySelector("#improved");
const improvedText = document.querySelector("#improved-text");
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
