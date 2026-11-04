sUAS Flight Logger - Flight Data Management v7

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
