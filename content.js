// Content script — injects a small button on YouTube video pages
// This provides quick access without opening the popup

(function () {
  "use strict";

  let buttonInjected = false;

  function injectButton() {
    if (buttonInjected) return;
    if (document.getElementById("video-study-ai-btn")) return;

    // Find the YouTube actions bar (below the video title)
    const actionsBar = document.querySelector("#actions #top-level-buttons-computed")
      || document.querySelector("ytd-menu-renderer #top-level-buttons-computed");

    if (!actionsBar) return;

    const btn = document.createElement("button");
    btn.id = "video-study-ai-btn";
    btn.innerHTML = "📚 Study";
    btn.title = "Summarize this video with AI";
    btn.addEventListener("click", () => {
      // Open the extension popup (can't programmatically open popup, so open in new tab)
      chrome.runtime.sendMessage({ action: "getStatus" }).then(() => {
        // Trigger popup by simulating extension icon click isn't possible,
        // so we'll show a notification to use the extension icon
        showToast("Click the 📚 extension icon in your toolbar to summarize this video!");
      });
    });

    actionsBar.appendChild(btn);
    buttonInjected = true;
  }

  function showToast(message) {
    const existing = document.getElementById("video-study-ai-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "video-study-ai-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  }

  // YouTube is a SPA — watch for navigation
  const observer = new MutationObserver(() => {
    if (window.location.pathname === "/watch") {
      buttonInjected = false;
      setTimeout(injectButton, 1500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial injection
  if (window.location.pathname === "/watch") {
    setTimeout(injectButton, 2000);
  }
})();
