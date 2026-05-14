// Background service worker — handles API calls to keep API key secure

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const FREE_DAILY_LIMIT = 3;

// Get API key from storage (set via options/settings page)
async function getApiKey() {
  const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");
  return geminiApiKey || "";
}

// Get today's usage count
async function getUsage() {
  const today = new Date().toISOString().split("T")[0];
  const { usage } = await chrome.storage.local.get("usage");
  if (usage && usage.date === today) {
    return usage.count;
  }
  return 0;
}

// Increment usage
async function incrementUsage() {
  const today = new Date().toISOString().split("T")[0];
  const { usage } = await chrome.storage.local.get("usage");
  if (usage && usage.date === today) {
    usage.count += 1;
    await chrome.storage.local.set({ usage });
  } else {
    await chrome.storage.local.set({ usage: { date: today, count: 1 } });
  }
}

// Check if user is premium
async function isPremium() {
  const { premium } = await chrome.storage.sync.get("premium");
  if (!premium) return false;
  return new Date(premium.expiresAt) > new Date();
}

// Call Gemini API
async function callGemini(prompt, model = "gemini-3.1-flash-lite") {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API key not set. Go to extension settings.");
  }

  const response = await fetch(
    `${API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Call Gemini with YouTube video URL (native video understanding)
async function callGeminiWithVideo(videoUrl, prompt, model = "gemini-3.1-flash-lite") {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API key not set. Go to extension settings.");
  }

  const response = await fetch(
    `${API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { file_uri: videoUrl, mime_type: "video/mp4" } },
            { text: prompt },
          ]
        }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // async response
});

async function handleMessage(request) {
  if (request.action === "getStatus") {
    const usage = await getUsage();
    const premium = await isPremium();
    const apiKey = await getApiKey();
    return {
      usage,
      limit: FREE_DAILY_LIMIT,
      premium,
      hasApiKey: !!apiKey,
    };
  }

  if (request.action === "checkLimit") {
    const premium = await isPremium();
    if (premium) return { allowed: true };
    const usage = await getUsage();
    return { allowed: usage < FREE_DAILY_LIMIT };
  }

  if (request.action === "summarize") {
    const premium = await isPremium();
    if (!premium) {
      const usage = await getUsage();
      if (usage >= FREE_DAILY_LIMIT) {
        return { error: "limit_reached" };
      }
    }

    const prompt = `Create detailed study notes from this YouTube video. Structure it like the best lecture notes a top student would write.

Format your response in clean HTML (no code fences, just the HTML):

<h3>📚 Topic Overview</h3>
<p>2-3 sentences explaining the subject and its importance</p>

<h3>📌 Key Concepts</h3>
<ul>
<li><strong>Concept 1</strong> — explanation in simple terms</li>
<li><strong>Concept 2</strong> — explanation in simple terms</li>
</ul>

<h3>🔗 How They Connect</h3>
<p>Explain relationships between concepts</p>

<h3>⚡ Quick Revision</h3>
<ul>
<li>Point 1</li>
<li>Point 2</li>
</ul>

<h3>💡 Key Takeaway</h3>
<p>One sentence summary of the most important thing to remember</p>`;

    const result = await callGeminiWithVideo(request.videoUrl, prompt);
    await incrementUsage();
    return { result };
  }

  if (request.action === "flashcards") {
    const premium = await isPremium();
    if (!premium) {
      const usage = await getUsage();
      if (usage >= FREE_DAILY_LIMIT) {
        return { error: "limit_reached" };
      }
    }

    const prompt = `Generate exactly 5 flashcards from this YouTube video.
Return ONLY valid JSON (no markdown, no code fences):
{
  "cards": [
    {"question": "Q text", "answer": "A text"},
    {"question": "Q text", "answer": "A text"}
  ]
}
Rules:
- Mix question types: definitions, explanations, comparisons
- Questions test understanding, not just recall
- Answers are concise (1-2 sentences)`;

    const result = await callGeminiWithVideo(request.videoUrl, prompt);
    await incrementUsage();
    // Parse JSON from response
    let cards;
    try {
      let raw = result.trim();
      if (raw.startsWith("```")) {
        raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      const match = raw.match(/\{[\s\S]*\}/);
      cards = JSON.parse(match ? match[0] : raw);
    } catch (e) {
      return { error: "Failed to parse flashcards. Try again." };
    }
    return { result: cards };
  }

  if (request.action === "quiz") {
    const premium = await isPremium();
    if (!premium) {
      const usage = await getUsage();
      if (usage >= FREE_DAILY_LIMIT) {
        return { error: "limit_reached" };
      }
    }

    const prompt = `Generate a 5-question multiple choice quiz from this YouTube video.
Return ONLY valid JSON (no markdown, no code fences):
{
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Why this is correct"
    }
  ]
}
Rules:
- Exactly 5 questions, 4 options each
- "answer" is 0-based index of correct option
- Moderate to hard difficulty
- Do NOT use LaTeX or math delimiters`;

    const result = await callGeminiWithVideo(request.videoUrl, prompt);
    await incrementUsage();
    let quiz;
    try {
      let raw = result.trim();
      if (raw.startsWith("```")) {
        raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      const match = raw.match(/\{[\s\S]*\}/);
      quiz = JSON.parse(match ? match[0] : raw);
    } catch (e) {
      return { error: "Failed to parse quiz. Try again." };
    }
    return { result: quiz };
  }

  if (request.action === "setApiKey") {
    await chrome.storage.sync.set({ geminiApiKey: request.key });
    return { success: true };
  }

  return { error: "Unknown action" };
}
