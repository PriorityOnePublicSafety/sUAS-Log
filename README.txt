sUAS FLIGHT LOGGER — FIRST OFFLINE PROTOTYPE

WHAT THIS VERSION DOES
- iPhone-friendly installable web app (when hosted on HTTPS).
- Start Flight / End Flight buttons.
- Saves active flight details and completed records locally in the browser using IndexedDB.
- Default pilot is Jacob Griffin.
- Aircraft, controller, LOS/BVLOS, operation type, location and notes fields.
- 24-hour time display and automatic duration calculation, including flights crossing midnight.
- CSV export for opening in Excel and storing in Box.
- App shell is cached for offline reopening after the first successful online load.

IMPORTANT LIMITATION
This is Phase 1: local/offline storage and CSV export only. It does NOT yet synchronize with Google Sheets or Box. The app must be hosted on HTTPS to install as a home-screen web app. Browser/site data must not be cleared or the local records may be lost. Export backups regularly.

IPHONE INSTALL
1. Publish these files to an HTTPS static host (for example GitHub Pages).
2. Open the published URL in Safari on the iPhone while online.
3. Tap Share > Add to Home Screen.
4. Launch from the new home-screen icon.
5. Keep the app installed and export CSV backups regularly.

TEST
1. Open the app while online once.
2. Turn on Airplane Mode.
3. Reopen the app from the Home Screen.
4. Start and end a test flight.
5. Export CSV after reconnecting and open it in Excel.

NEXT PHASE
Connect this offline-first app to a Google-backed database with a reliable sync queue, record IDs for duplicate prevention, and future pilot accounts. Google sign-in and cloud sync are intentionally not enabled in this prototype.
