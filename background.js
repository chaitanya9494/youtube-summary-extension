// Background service worker — calls your backend API (no API key needed by users)

// TODO: Replace with your Railway deployment URL
const API_BASE = "https://your-railway-app.up.railway.app";
const FREE_DAILY_LIMIT = 3;

// Anonymous device ID for rate limiting (generated once, persists)
async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

// Get today's usage count from server
async function getUsage() {
  const deviceId = await getDeviceId();
  try {
    const resp = await fetch(`${API_BASE}/api/usage?device_id=${deviceId}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.usage;
    }
  } catch (e) {
    // Fallback to local tracking
  }
  const today = new Date().toISOString().split("T")[0];
  const { usage } = await chrome.storage.local.get("usage");
  if (usage && usage.date === today) return usage.count;
  return 0;
}

// Local usage tracking as backup
async function incrementLocalUsage() {
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

// Call backend API
async function callApi(endpoint, body) {
  const deviceId = await getDeviceId();
  body.device_id = deviceId;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    return { error: "limit_reached" };
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${response.status}`);
  }

  return await response.json();
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
    const { language } = await chrome.storage.sync.get("language");
    return {
      usage,
      limit: FREE_DAILY_LIMIT,
      premium,
      hasApiKey: true, // No API key needed anymore
      language: language || "English",
    };
  }

  if (request.action === "checkLimit") {
    const premium = await isPremium();
    if (premium) return { allowed: true };
    const usage = await getUsage();
    return { allowed: usage < FREE_DAILY_LIMIT };
  }

  if (request.action === "summarize") {
    const { language } = await chrome.storage.sync.get("language");
    const result = await callApi("/api/summarize", {
      video_url: request.videoUrl,
      language: language || "English",
    });
    if (!result.error) await incrementLocalUsage();
    return result;
  }

  if (request.action === "flashcards") {
    const { language } = await chrome.storage.sync.get("language");
    const result = await callApi("/api/flashcards", {
      video_url: request.videoUrl,
      language: language || "English",
    });
    if (!result.error) await incrementLocalUsage();
    return result;
  }

  if (request.action === "quiz") {
    const { language } = await chrome.storage.sync.get("language");
    const result = await callApi("/api/quiz", {
      video_url: request.videoUrl,
      language: language || "English",
    });
    if (!result.error) await incrementLocalUsage();
    return result;
  }

  if (request.action === "ask") {
    const { language } = await chrome.storage.sync.get("language");
    const result = await callApi("/api/ask", {
      video_url: request.videoUrl,
      question: request.question,
      language: language || "English",
    });
    return result;
  }

  if (request.action === "setLanguage") {
    await chrome.storage.sync.set({ language: request.language });
    return { success: true };
  }

  if (request.action === "getSettings") {
    const { language } = await chrome.storage.sync.get("language");
    return { language: language || "English" };
  }

  return { error: "Unknown action" };
}
