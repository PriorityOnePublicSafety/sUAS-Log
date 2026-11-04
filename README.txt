sUAS Flight Logger - Flight Data Management v7 (Whole-Minute Duration Update)

Deployment:
1. Extract this ZIP.
2. Upload all files in this folder to the root of the existing GitHub repository, replacing files with the same names.
3. Keep the repository and Google Sheet. Do not create a new repository or spreadsheet.
4. Wait for GitHub Pages to finish deploying.
5. On each device, refresh the hosted app so it loads v7.

Google Sheets data management:
- SYNC FLIGHTS uploads local records whose Record IDs are not already in the master spreadsheet.
- MERGE FROM GOOGLE SHEETS downloads rows from the Flights tab and adds only Record IDs missing from this device. Existing local records are preserved.
- REPLACE LOCAL DATA FROM SHEET downloads the Flights tab and replaces this device's local flight history. Local-only records not present in the sheet are discarded. The app asks for confirmation before replacing.
- CLEAR LOCAL DATA deletes flight records from this device only. It does not change the Google Sheet or Google connection settings.

Important:
- Google Sheets remains the shared master copy. Clear, Merge, and Replace do not edit spreadsheet contents.
- Each device has its own local database. Run the desired action separately on iPhone and desktop.
- Connect Google while online before using Merge or Replace.
- Never use Replace if this device contains local-only flights that have not been uploaded, unless you intend to discard them.
- Keep the first/header row of the Flights tab intact and retain columns A:M, including Entry Source in column M.
- The Google OAuth Client ID is public app configuration. Never add a client secret, private key, password, or access token to this static site.


Flight duration update:
- Flight durations are stored as whole minutes in the local database and Google Sheet column E (Flight Minutes).
- Live flight duration is rounded to the nearest whole minute when END FLIGHT is selected.
- Manual duration entry accepts minutes only. When takeoff and landing times are provided, the app calculates and rounds the duration to the nearest minute.
- On first connection after this update, an existing Flight Hours column is automatically converted from decimal hours to whole minutes and renamed Flight Minutes. The conversion is performed as one Google Sheets batch update.
- Existing local records stored in decimal hours are migrated to whole minutes on app startup.
- The total flight time display adds whole minutes and displays hours plus remaining minutes when appropriate.
- CSV export uses a Flight Minutes column.
