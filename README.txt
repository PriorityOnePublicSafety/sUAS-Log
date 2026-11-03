sUAS FLIGHT LOGGER — OFFLINE + GOOGLE SHEETS SYNC

WHAT IS NEW
- Keeps the original IndexedDB offline storage and active-flight recovery.
- Google sign-in using the configured OAuth Client ID.
- Creates a Google spreadsheet named "sUAS Flight Log" in the signed-in user's Drive.
- Syncs completed flights and checks unique Record IDs before appending to avoid duplicates on normal retries.
- Automatically attempts sync after a flight ends and when connectivity returns, while signed in.
- CSV export remains available.

IMPORTANT
- The Google spreadsheet is created in the Google account that signs in. Keep it private; do not share it publicly.
- This is a single-account pilot implementation, not a multi-pilot access-control system.
- The access token is kept in memory only and is not stored in localStorage. After closing/reopening the app, tap Connect Google Account again to authorize a new session.
- Flights are always saved locally first. Sync requires internet and Google authorization.
- The app contains an OAuth Client ID, which is public by design. It does NOT contain a client secret, service-account key, or password.
- If Google reports that the app is in testing, sign in using the Gmail account added as a test user.
- Since the app requests drive.file, the spreadsheet it creates is the file it can access. Do not move or delete that spreadsheet if you want the app to keep syncing to it.
- Keep exporting CSV backups while testing. No cloud sync implementation should be treated as a substitute for independent backups.

DEPLOY
1. Extract this ZIP.
2. In your GitHub repository, upload/replace the files in the repository root with these updated files.
3. Commit the changes to the main branch.
4. Wait for GitHub Pages to redeploy.
5. Open the site online, reload, and tap Connect Google Account.
6. Approve the requested Google Drive file access.
7. Confirm that a "sUAS Flight Log" spreadsheet appears in your Google Drive.
8. Log a short TEST flight and tap Sync Flights. Confirm one new row appears in the spreadsheet.

OFFLINE
- Start/end flights offline as before.
- When back online, reconnect Google if needed and tap Sync Flights.


SHARED GOOGLE SHEET CONFIGURATION
This build is configured to use one shared master spreadsheet ID across all devices. Do not change MASTER_SHEET_ID in app.js unless intentionally changing the master spreadsheet. The app will append records to the Flights tab in that spreadsheet. Keep the spreadsheet private in the Google account that authorized the app.
