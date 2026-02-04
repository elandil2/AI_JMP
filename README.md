<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1f6Jueet8-QAyOniMPL5ZsDcbWsSntfP7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. (Optional) Set `VITE_ADMIN_CODE` in `.env.local` to choose the admin passcode. Default is `admin`.
3. Run the app:
   `npm run dev`

## What this build includes

- Admin-gated workspace: you must sign in with the admin code before creating reports.
- One-click, read-only share links: every generated report is encoded into the URL so it can be opened anywhere without editing.
- Printable handoff: PDF/print-friendly layout, navigation link, and WhatsApp share.
- Batch upload helper: prepare a CSV-like list of routes and run them in sequence (admin only).
