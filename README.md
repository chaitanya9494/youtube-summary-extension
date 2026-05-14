# Video Study AI — Chrome Extension

AI-powered YouTube study assistant. Summarize any video, get flashcards, and take interactive quizzes.

## Features

- 📝 Detailed study notes from any YouTube video
- 📋 Flashcards with tap-to-reveal answers
- ❓ Interactive multiple-choice quizzes with explanations
- Free tier: 3 videos/day
- Premium: unlimited (via Stripe subscription)

## Setup (Development)

1. Get a Gemini API key from https://aistudio.google.com/apikey
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select this folder
5. Click the extension icon on any YouTube video
6. Enter your Gemini API key in Settings

## Project Structure

```
manifest.json      — Extension config (Manifest V3)
background.js      — Service worker: API calls, usage tracking
popup.html/css/js  — Extension popup UI
content.js/css     — YouTube page integration (Study button)
icons/             — Extension icons (add your own)
```

## Icons

Add your icons to the `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Publishing to Chrome Web Store

1. Create icons and screenshots
2. Zip the extension folder (exclude .git, README)
3. Go to https://chrome.google.com/webstore/devconsole
4. Pay $5 one-time developer fee
5. Upload zip, fill in listing details
6. Submit for review (1-3 days)

## Monetization

Replace the Stripe payment link in `popup.js` (`btnSubscribe` click handler) with your actual Stripe Checkout URL. After payment, set `premium: { expiresAt: "..." }` in `chrome.storage.sync` via a webhook or redirect page.
