# UniNest – PRD

## Original Problem Statement
User wants to edit and add more features to their existing UniNest repo (https://github.com/sharan4536/UniNest).

## Architecture
- Vite + React 18 + TypeScript
- Firebase (Auth + Firestore) — configured with user's uninest-ca9a6 project
- Tailwind CSS v4 + shadcn/ui components
- Leaflet/Mapbox maps, PDF.js, Tesseract.js for timetable import

## Preview / Runtime
- Supervisor service: `uninest` runs `yarn dev --host 0.0.0.0 --port 3000` from `/app`
- Config: `/etc/supervisor/conf.d/supervisord_uninest.conf`
- `vite.config.ts`: `server.allowedHosts = true` to accept the preview URL
- Firebase keys in `/app/.env` (VITE_FIREBASE_*, VITE_MAPBOX_TOKEN, VITE_USE_FIREBASE=true)

## Implemented (this session)

### Feature 1: Timetable class edit (2026-04-22)
`src/components/TimetablePage.tsx`
- Added `editingClass` state, `handleEditClass()`, `handleUpdateClass()`, `resetClassForm()`
- Add-dialog repurposed for edits (dynamic title + button text)
- Edit entry points: (a) click any class while "Edit Schedule" mode is on (grid/list/timeline), (b) "Edit Class" button in Class Details dialog, (c) inline "Edit" pill in list view
- Day changes handled — class moved from original day to new day on save

### Feature 2: FFCS Timetable Parser (2026-04-22)
`src/utils/ffcsParser.ts` (new, 240 LOC)
- Fixed slot→time maps for THEORY (A1/F1/D1/TB1/TG1/A2/F2/D2/TB2/TG2) and LAB (L1–L6, L31–L36)
- Global regex `SLOT-CODE-TYPE-ROOM-GROUP` extraction — bypasses column alignment
- Day-state tracking scans tokens and attaches cells to the most recently seen MON/TUE/…
- Deduplication via `day|slot|code|room` set
- Slot merging for same courseCode+room with contiguous times (1-minute tolerance handles L33→L34)
- Course-name map (CBS1007 → Database Systems, etc.) — extensible via `opts.courseNames`
- Bonus helpers: `currentOngoing()`, `nextUpcoming()`, `freeSlotsForDay()`
- Helpers: `to12h()`, `formatTimeRange()`, `ffcsToParsedClasses()` (converter for existing save pipeline)

`src/components/TimetablePage.tsx` integration
- `parseAndPreview()` now tries FFCS parser first, falls back to legacy parser
- Applied to all three import paths: Text, Image (OCR), PDF
- New FFCS Preview panel in the Import dialog — shows merged events grouped by day with time range + slots + room
- Saved ClassItems now get readable titles like "Database Systems – ETH (L33+L34)"

`src/utils/timetableParser.ts`
- `ParsedClass` type extended with optional `rawType`, `courseName`, `slots` (non-breaking)

## Verification
- `yarn build`: clean build, no TS errors
- `npx tsc --noEmit --strict`: 0 user-code errors
- Manual parser test on mixed/noisy/repeated input: all cases pass
  - `L33+L34` merges into "03:51 PM – 05:30 PM" (matches spec example exactly)
  - Repeated MON block deduplicated
  - Course names mapped, type preserved, days sorted chronologically
- Preview URL serves login page cleanly with Firebase connected

## Backlog
- P1: End-to-end edit→Firestore persistence test (requires logged-in user session)
- P2: Drag-to-reschedule on grid view
- P2: Full FFCS slot tables (B1/C1/E1/G1/… + TA/TC/TD/TE/TF variants)
- P2: Inline "Next Upcoming" / "Ongoing" banner on TimetablePage using the parser helpers
- P3: Undo recent import/edit action
