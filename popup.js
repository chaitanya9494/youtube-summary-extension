// Popup script — handles UI interactions

const elements = {
  notOnYoutube: document.getElementById("notOnYoutube"),
  mainActions: document.getElementById("mainActions"),
  premiumGate: document.getElementById("premiumGate"),
  settingsPanel: document.getElementById("settingsPanel"),
  videoTitle: document.getElementById("videoTitle"),
  usageText: document.getElementById("usageText"),
  upgradeLink: document.getElementById("upgradeLink"),
  btnSummary: document.getElementById("btnSummary"),
  btnFlashcards: document.getElementById("btnFlashcards"),
  btnQuiz: document.getElementById("btnQuiz"),
  btnAsk: document.getElementById("btnAsk"),
  btnSpeak: document.getElementById("btnSpeak"),
  btnSubscribe: document.getElementById("btnSubscribe"),
  askContainer: document.getElementById("askContainer"),
  askInput: document.getElementById("askInput"),
  askSubmit: document.getElementById("askSubmit"),
  result: document.getElementById("result"),
  resultContent: document.getElementById("resultContent"),
  loading: document.getElementById("loading"),
  loadingText: document.getElementById("loadingText"),
  quizContainer: document.getElementById("quizContainer"),
  settingsLink: document.getElementById("settingsLink"),
  feedbackLink: document.getElementById("feedbackLink"),
  langSelect: document.getElementById("langSelect"),
  saveSettings: document.getElementById("saveSettings"),
  cancelSettings: document.getElementById("cancelSettings"),
};

let currentVideoUrl = null;
let currentQuiz = null;
let quizIndex = 0;
let quizScore = 0;
let lastSummaryText = ""; // For TTS

// Initialize popup
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  if (!url.includes("youtube.com/watch")) {
    showState("notOnYoutube");
    return;
  }

  currentVideoUrl = url;
  elements.videoTitle.textContent = tab.title?.replace(" - YouTube", "") || "YouTube Video";

  const status = await chrome.runtime.sendMessage({ action: "getStatus" });

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
  elements.settingsPanel.classList.add("hidden");
  document.getElementById(state)?.classList.remove("hidden");
}

function showLoading(show, text = "Generating...") {
  elements.loading.classList.toggle("hidden", !show);
  elements.loadingText.textContent = text;
  if (show) {
    elements.result.classList.add("hidden");
    elements.quizContainer.classList.add("hidden");
    elements.askContainer.classList.add("hidden");
  }
  const btns = [elements.btnSummary, elements.btnFlashcards, elements.btnQuiz, elements.btnAsk, elements.btnSpeak];
  btns.forEach(b => b.disabled = show);
}

// Summary
elements.btnSummary.addEventListener("click", async () => {
  showLoading(true, "Generating summary...");
  const response = await chrome.runtime.sendMessage({
    action: "summarize",
    videoUrl: currentVideoUrl,
  });
  showLoading(false);

  if (response.error === "limit_reached") { showState("premiumGate"); return; }
  if (response.error) {
    elements.resultContent.innerHTML = `<p>❌ ${escapeHtml(response.error)}</p>`;
  } else {
    elements.resultContent.innerHTML = response.result;
    lastSummaryText = elements.resultContent.textContent;
  }
  elements.result.classList.remove("hidden");
});

// Flashcards
elements.btnFlashcards.addEventListener("click", async () => {
  showLoading(true, "Creating flashcards...");
  const response = await chrome.runtime.sendMessage({
    action: "flashcards",
    videoUrl: currentVideoUrl,
  });
  showLoading(false);

  if (response.error === "limit_reached") { showState("premiumGate"); return; }
  if (response.error) {
    elements.resultContent.innerHTML = `<p>❌ ${escapeHtml(response.error)}</p>`;
    elements.result.classList.remove("hidden");
    return;
  }

  const cards = response.result.cards || [];
  let html = "<h3>📋 Flashcards</h3><p class='small'>Click to reveal answers</p>";
  cards.forEach((card, i) => {
    html += `
      <div class="flashcard">
        <div class="flashcard-q">Q${i + 1}: ${escapeHtml(card.question)}</div>
        <div class="flashcard-a hidden-answer" onclick="this.textContent='${escapeHtml(card.answer).replace(/'/g, "\\'")}'; this.classList.remove('hidden-answer'); this.classList.add('revealed');">
          Tap to reveal
        </div>
      </div>`;
  });
  elements.resultContent.innerHTML = html;
  elements.result.classList.remove("hidden");
});

// Quiz
elements.btnQuiz.addEventListener("click", async () => {
  showLoading(true, "Preparing quiz...");
  const response = await chrome.runtime.sendMessage({
    action: "quiz",
    videoUrl: currentVideoUrl,
  });
  showLoading(false);

  if (response.error === "limit_reached") { showState("premiumGate"); return; }
  if (response.error) {
    elements.resultContent.innerHTML = `<p>❌ ${escapeHtml(response.error)}</p>`;
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
    const pct = Math.round((quizScore / currentQuiz.length) * 100);
    let emoji = pct >= 80 ? "🎉" : pct >= 60 ? "👍" : "📚";
    elements.quizContainer.innerHTML = `
      <div class="quiz-score">
        ${emoji} Quiz Complete!<br>
        Score: ${quizScore}/${currentQuiz.length} (${pct}%)
      </div>`;
    elements.quizContainer.classList.remove("hidden");
    return;
  }

  const q = currentQuiz[quizIndex];
  const letters = ["A", "B", "C", "D"];
  let html = `<div class="quiz-question">Q${quizIndex + 1}/${currentQuiz.length}: ${escapeHtml(q.question)}</div>`;

  q.options.forEach((opt, i) => {
    html += `<button class="quiz-option" data-index="${i}">${letters[i]}) ${escapeHtml(opt)}</button>`;
  });

  elements.quizContainer.innerHTML = html;
  elements.quizContainer.classList.remove("hidden");
  elements.result.classList.add("hidden");

  elements.quizContainer.querySelectorAll(".quiz-option").forEach(btn => {
    btn.addEventListener("click", () => handleQuizAnswer(parseInt(btn.dataset.index)));
  });
}

function handleQuizAnswer(choice) {
  const q = currentQuiz[quizIndex];
  const correct = q.answer;
  const isCorrect = choice === correct;
  if (isCorrect) quizScore++;

  elements.quizContainer.querySelectorAll(".quiz-option").forEach((btn, i) => {
    btn.classList.add("disabled");
    if (i === correct) btn.classList.add("correct");
    if (i === choice && !isCorrect) btn.classList.add("wrong");
  });

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

// Q&A
elements.btnAsk.addEventListener("click", () => {
  elements.askContainer.classList.toggle("hidden");
  elements.askInput.focus();
});

elements.askSubmit.addEventListener("click", submitQuestion);
elements.askInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitQuestion();
});

async function submitQuestion() {
  const question = elements.askInput.value.trim();
  if (!question) return;

  showLoading(true, "Thinking...");
  elements.askContainer.classList.add("hidden");

  const response = await chrome.runtime.sendMessage({
    action: "ask",
    videoUrl: currentVideoUrl,
    question,
  });
  showLoading(false);

  if (response.error === "limit_reached") { showState("premiumGate"); return; }
  if (response.error) {
    elements.resultContent.innerHTML = `<p>❌ ${escapeHtml(response.error)}</p>`;
  } else {
    elements.resultContent.innerHTML = `
      <h3>💬 Answer</h3>
      <p class="small"><em>${escapeHtml(question)}</em></p>
      <p>${escapeHtml(response.result)}</p>`;
  }
  elements.result.classList.remove("hidden");
  elements.askInput.value = "";
}

// Text-to-Speech (browser built-in)
elements.btnSpeak.addEventListener("click", () => {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    elements.btnSpeak.textContent = "🔊 Listen";
    return;
  }

  const text = lastSummaryText || elements.resultContent?.textContent || "";
  if (!text) {
    elements.resultContent.innerHTML = "<p>Generate a summary first, then click Listen to hear it.</p>";
    elements.result.classList.remove("hidden");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text.slice(0, 5000));
  utterance.rate = 0.9;
  utterance.onend = () => { elements.btnSpeak.textContent = "🔊 Listen"; };
  utterance.onerror = () => { elements.btnSpeak.textContent = "🔊 Listen"; };
  elements.btnSpeak.textContent = "⏹ Stop";
  speechSynthesis.speak(utterance);
});

// Settings
elements.settingsLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const settings = await chrome.runtime.sendMessage({ action: "getSettings" });
  elements.langSelect.value = settings.language || "English";
  showState("settingsPanel");
});

elements.saveSettings.addEventListener("click", async () => {
  const lang = elements.langSelect.value;
  await chrome.runtime.sendMessage({ action: "setLanguage", language: lang });
  init();
});

elements.cancelSettings.addEventListener("click", () => {
  init();
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

// Feedback
elements.feedbackLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://t.me/YourBotUsername" });
});

// Utility
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Init
init();
