sUAS FLIGHT LOGGER — GOOGLE SHEETS SYNC FIX (v5)

WHAT THIS UPDATE CHANGES
- Prevents the service worker from intercepting or caching Google Sheets API and other cross-origin requests.
- Makes Google API requests bypass the browser HTTP cache.
- Activates the new service worker immediately and claims open app clients.
- Uses network-first loading for same-origin app files, with cached fallback when offline.
- Keeps the existing IndexedDB database and records unchanged.
- Keeps the shared master spreadsheet ID configured in app.js.

DEPLOYMENT
1. Download and extract this ZIP.
2. In the GitHub repository, upload and replace the existing files with these files (keep them at the repository root).
3. Wait for GitHub Pages to finish deploying.
4. On iPhone, fully close the Home Screen app, open the Pages URL in Safari while online, refresh once, then reopen the Home Screen app.
5. Reconnect Google and sync twice without creating a new flight. The second sync should report 0 new flights if the first sync completed.

IMPORTANT
- Do not delete website data, uninstall the PWA, or clear IndexedDB. Your locally stored flight records are preserved by this update.
- Do not delete duplicate spreadsheet rows during this test; keep a backup first.
- The Google OAuth Client ID is public by design. Never put passwords, client secrets, private keys, or access tokens in GitHub.


VERSION 6 - MANUAL FLIGHT ENTRY
- Adds a dedicated Manual Flight Entry page.
- Supports takeoff + landing times, takeoff + elapsed duration, and duration-only records.
- Calculates landing time from takeoff + elapsed duration and saves it as the landing time.
- Duration-only records retain blank takeoff and landing times.
- Manual entries use unique IDs, local IndexedDB storage, CSV export, and existing Google Sheets duplicate-safe sync.
- Existing database and local flight records are preserved.
