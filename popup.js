// Popup script — handles UI interactions

const elements = {
  notOnYoutube: document.getElementById("notOnYoutube"),
  mainActions: document.getElementById("mainActions"),
  premiumGate: document.getElementById("premiumGate"),
  videoTitle: document.getElementById("videoTitle"),
  usageText: document.getElementById("usageText"),
  upgradeLink: document.getElementById("upgradeLink"),
  btnSummary: document.getElementById("btnSummary"),
  btnFlashcards: document.getElementById("btnFlashcards"),
  btnQuiz: document.getElementById("btnQuiz"),
  btnSubscribe: document.getElementById("btnSubscribe"),
  result: document.getElementById("result"),
  resultContent: document.getElementById("resultContent"),
  loading: document.getElementById("loading"),
  quizContainer: document.getElementById("quizContainer"),
  settingsLink: document.getElementById("settingsLink"),
  feedbackLink: document.getElementById("feedbackLink"),
};

let currentVideoUrl = null;
let currentQuiz = null;
let quizIndex = 0;
let quizScore = 0;

// Initialize popup
async function init() {
  // Check if we're on a YouTube video page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  if (!url.includes("youtube.com/watch")) {
    showState("notOnYoutube");
    return;
  }

  currentVideoUrl = url;
  elements.videoTitle.textContent = tab.title?.replace(" - YouTube", "") || "YouTube Video";

  // Get usage status
  const status = await chrome.runtime.sendMessage({ action: "getStatus" });

  if (!status.hasApiKey) {
    elements.resultContent.innerHTML = '<p>⚙️ Set your Gemini API key in <a href="#" id="openSettings">Settings</a> to get started.</p>';
    elements.result.classList.remove("hidden");
    showState("mainActions");
    document.getElementById("openSettings")?.addEventListener("click", openSettings);
    return;
  }

  if (!status.premium && status.usage >= status.limit) {
    showState("premiumGate");
    return;
  }

  const remaining = status.premium ? "∞" : `${status.limit - status.usage}/${status.limit}`;
  elements.usageText.textContent = `${remaining} free today`;
  if (!status.premium) {
    elements.upgradeLink.classList.remove("hidden");
  }

  showState("mainActions");
}

function showState(state) {
  elements.notOnYoutube.classList.add("hidden");
  elements.mainActions.classList.add("hidden");
  elements.premiumGate.classList.add("hidden");
  document.getElementById(state)?.classList.remove("hidden");
}

function showLoading(show) {
  elements.loading.classList.toggle("hidden", !show);
  elements.result.classList.add("hidden");
  elements.quizContainer.classList.add("hidden");
  elements.btnSummary.disabled = show;
  elements.btnFlashcards.disabled = show;
  elements.btnQuiz.disabled = show;
}

// Summary
elements.btnSummary.addEventListener("click", async () => {
  showLoading(true);
  const response = await chrome.runtime.sendMessage({
    action: "summarize",
    videoUrl: currentVideoUrl,
  });
  showLoading(false);

  if (response.error === "limit_reached") {
    showState("premiumGate");
    return;
  }
  if (response.error) {
    elements.resultContent.innerHTML = `<p>❌ ${response.error}</p>`;
  } else {
    // Response is HTML formatted
    elements.resultContent.innerHTML = response.result;
  }
  elements.result.classList.remove("hidden");
});

// Flashcards
elements.btnFlashcards.addEventListener("click", async () => {
  showLoading(true);
  const response = await chrome.runtime.sendMessage({
    action: "flashcards",
    videoUrl: currentVideoUrl,
  });
  showLoading(false);

  if (response.error === "limit_reached") {
    showState("premiumGate");
    return;
  }
  if (response.error) {
    elements.resultContent.innerHTML = `<p>❌ ${response.error}</p>`;
    elements.result.classList.remove("hidden");
    return;
  }

  const cards = response.result.cards || [];
  let html = "<h3>📋 Flashcards</h3>";
  cards.forEach((card, i) => {
    html += `
      <div class="flashcard">
        <div class="flashcard-q">Q${i + 1}: ${escapeHtml(card.question)}</div>
        <div class="flashcard-a hidden-answer" data-answer="${escapeHtml(card.answer)}" onclick="this.textContent=this.dataset.answer; this.classList.remove('hidden-answer'); this.classList.add('revealed');">
          Click to reveal answer
        </div>
      </div>`;
  });
  elements.resultContent.innerHTML = html;
  elements.result.classList.remove("hidden");
});

// Quiz
elements.btnQuiz.addEventListener("click", async () => {
  showLoading(true);
  const response = await chrome.runtime.sendMessage({
    action: "quiz",
    videoUrl: currentVideoUrl,
  });
  showLoading(false);

  if (response.error === "limit_reached") {
    showState("premiumGate");
    return;
  }
  if (response.error) {
    elements.resultContent.innerHTML = `<p>❌ ${response.error}</p>`;
    elements.result.classList.remove("hidden");
    return;
  }

  currentQuiz = response.result.questions || [];
  quizIndex = 0;
  quizScore = 0;
  showQuizQuestion();
});

function showQuizQuestion() {
  if (quizIndex >= currentQuiz.length) {
    elements.quizContainer.innerHTML = `
      <div class="quiz-score">
        🏁 Quiz Complete!<br>
        Score: ${quizScore}/${currentQuiz.length}
      </div>`;
    elements.quizContainer.classList.remove("hidden");
    return;
  }

  const q = currentQuiz[quizIndex];
  const letters = ["A", "B", "C", "D"];
  let html = `
    <div class="quiz-question">Q${quizIndex + 1}/${currentQuiz.length}: ${escapeHtml(q.question)}</div>`;

  q.options.forEach((opt, i) => {
    html += `<button class="quiz-option" data-index="${i}">${letters[i]}) ${escapeHtml(opt)}</button>`;
  });

  elements.quizContainer.innerHTML = html;
  elements.quizContainer.classList.remove("hidden");
  elements.result.classList.add("hidden");

  // Add click handlers
  elements.quizContainer.querySelectorAll(".quiz-option").forEach(btn => {
    btn.addEventListener("click", () => handleQuizAnswer(parseInt(btn.dataset.index)));
  });
}

function handleQuizAnswer(choice) {
  const q = currentQuiz[quizIndex];
  const correct = q.answer;
  const isCorrect = choice === correct;
  if (isCorrect) quizScore++;

  // Disable all buttons and show correct/wrong
  elements.quizContainer.querySelectorAll(".quiz-option").forEach((btn, i) => {
    btn.classList.add("disabled");
    if (i === correct) btn.classList.add("correct");
    if (i === choice && !isCorrect) btn.classList.add("wrong");
  });

  // Show explanation
  let explanation = `<div class="quiz-explanation">`;
  explanation += isCorrect ? "🎯 Correct!" : `❌ Answer was ${["A", "B", "C", "D"][correct]}.`;
  if (q.explanation) explanation += ` ${escapeHtml(q.explanation)}`;
  explanation += `</div>`;
  explanation += `<div class="quiz-nav"><button class="btn btn-primary" id="quizNext">${quizIndex < currentQuiz.length - 1 ? "Next →" : "See Score"}</button></div>`;

  elements.quizContainer.insertAdjacentHTML("beforeend", explanation);

  document.getElementById("quizNext").addEventListener("click", () => {
    quizIndex++;
    showQuizQuestion();
  });
}

// Settings
function openSettings() {
  const key = prompt("Enter your Gemini API key:");
  if (key) {
    chrome.runtime.sendMessage({ action: "setApiKey", key }).then(() => {
      location.reload();
    });
  }
}

elements.settingsLink.addEventListener("click", (e) => {
  e.preventDefault();
  openSettings();
});

// Feedback
elements.feedbackLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://t.me/YourBotUsername" });
});

// Upgrade
elements.upgradeLink.addEventListener("click", (e) => {
  e.preventDefault();
  showState("premiumGate");
});

elements.btnSubscribe.addEventListener("click", () => {
  // TODO: Replace with your Stripe payment link
  chrome.tabs.create({ url: "https://your-stripe-payment-link.com" });
});

// Utility
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Init
init();
