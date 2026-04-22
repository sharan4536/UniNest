# UniNest – PRD

## Original Problem Statement
User wants to edit and add more features to their existing UniNest repo (https://github.com/sharan4536/UniNest).

First requested feature: **Add a timetable edit option on the Timetable page.**

## Architecture
- Vite + React 18 + TypeScript
- Firebase (Auth + Firestore)
- Tailwind CSS v4 + shadcn/ui components
- Leaflet maps, PDF.js, Tesseract.js for timetable import

## Implemented (this session)
**Date: 2026-04-22**
- Added full **class edit** capability to `src/components/TimetablePage.tsx`:
  - New `editingClass` state tracks the class currently being edited (with original day + id).
  - New `handleEditClass(day, cls)` pre-fills the form dialog with the class's data.
  - New `handleUpdateClass()` writes the edited class back to Firestore (handles day changes by removing from original day and adding to new day).
  - Dialog title/button dynamically switch between "Add New Class" / "Edit Class" and "Add Class Project" / "Save Changes".
  - Grid view: clicking a class while in "Edit Schedule" mode opens the edit dialog.
  - List view: each class now shows both "Edit" and "Delete" pill buttons in edit mode.
  - Timeline view: clicking a class card in edit mode opens the edit dialog.
  - Class Details Dialog: replaced the placeholder "Find Friends" button with an **Edit Class** button (users can now edit any class without entering global edit mode).
  - Proper form reset on dialog close via `resetClassForm()`.
  - Toast confirmation on save.

## Verification
- `yarn build` succeeds with no TypeScript errors.
- `yarn dev` starts dev server successfully on port 3000.
- Existing features preserved (Add class, Delete, Import Text/Image/PDF, SOS sheet).

## Backlog / Next Items
- P1: Run app in preview and verify Firestore write for edits end-to-end (requires user's Firebase credentials/test account).
- P2: Inline quick-edit (pencil icon) on grid view class blocks.
- P2: Undo recent edit (similar to undo import).
- P3: Drag-and-drop reschedule (change day/time by dragging).
- P3: Bulk edit (e.g., change room for a whole course).
