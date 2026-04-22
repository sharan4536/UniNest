# UniNest Widgets

Bring your UniNest timetable to your phone's home screen. Three options are
provided, from zero-install to fully native:

| Option | Platform | Install effort | Look & feel |
|---|---|---|---|
| **A · PWA home-screen shortcut** | iOS + Android | None | A tappable icon that opens the widget UI full-screen |
| **B · iOS Scriptable widget** | iOS 14+ | Install Scriptable (free) | Real iOS home-screen widget, no app icon tap needed |
| **C · Android home-screen widget via KWGT / Tasker** | Android | Install KWGT (free) | Real Android widget, fully customisable |

All options render the same data: today's classes sorted morning → evening,
with the current class and the next upcoming class highlighted.

---

## Option A · PWA home-screen shortcut (both platforms)

This is the fastest route and requires no extra app.

1. Open your UniNest preview URL in **Safari (iOS)** or **Chrome (Android)**.
2. Navigate to `/widget`  — e.g. `https://<your-domain>/widget?size=medium`
   - `?size=small` → 170×170 "Now / Next" tile
   - `?size=medium` → 340×170 two-up Now + Next (recommended)
   - `?size=large` → 340×380 full list of today's sessions
3. **iOS (Safari):** tap Share → *Add to Home Screen*.
   **Android (Chrome):** tap ⋮ menu → *Add to Home screen*.
4. A UniNest icon appears on your home screen. Tapping it opens the widget
   UI full-screen (the manifest declares `display: standalone`, so it
   launches without browser chrome).

Notes
- The widget relies on the Firebase session in that browser — you must be
  signed in to the UniNest web app once. The session persists.
- Hot-reload / live updates happen every 30 seconds while the view is open.

---

## Option B · iOS Scriptable widget (real iOS widget)

Renders a genuine iOS home-screen widget from a script. No App Store review.

### 1 · Set up a public widget snapshot

iOS widgets fetch data without a Firebase session, so we mirror your
timetable into a small, read-only public document. Add the following rule
to `firestore.rules`:

```
match /publicWidgets/{uid} {
  allow read: if true;             // widget fetches this with no auth
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

Then, whenever the user saves their timetable in the main app, mirror it to
that path. The easiest way is a Cloud Function, or you can add a tiny write
in the app's `saveTimetable` helper:

```ts
// inside saveTimetable(...)
await setDoc(doc(db, 'publicWidgets', uid), {
  uid,
  timetable,
  updatedAt: serverTimestamp(),
});
```

### 2 · Install the Scriptable script

1. Install **Scriptable** from the App Store.
2. Open Scriptable → tap **+** → paste the contents of
   [`uninest_ios_scriptable.js`](./uninest_ios_scriptable.js) → rename to
   `UniNest`.
3. Long-press your home screen → **+** → search **Scriptable** → add a
   widget (small / medium / large as you prefer).
4. Long-press the widget → **Edit Widget**:
   - *Script:* `UniNest`
   - *When Interacting:* Run Script (or Open URL → your UniNest URL)
   - *Parameter:* paste your UniNest UID
     (find it in the UniNest web app → **Profile** or via the browser console
     `firebase.auth().currentUser.uid`).

The widget refreshes on iOS's schedule (~every 15-30 min). Data comes from
`publicWidgets/{uid}` via Firestore REST.

Customisation
- Edit `CONFIG.projectId` if you deploy under a different Firebase project.
- Set `CONFIG.idToken` instead of using `publicWidgets` if you prefer
  authenticated reads — but note iOS widgets can't refresh tokens on their
  own, so it will break after 1 hour.

---

## Option C · Android home-screen widget (KWGT)

KWGT is a free Android widget builder that can render JSON-driven layouts.

1. Install **KWGT Kustom Widget Maker** from Play Store.
2. Configure a public widget snapshot just like in Option B (Firestore rule
   + mirror write in `saveTimetable`).
3. In KWGT, create a new widget of your preferred size. Inside KWGT:
   - Add a **Globals** variable `UID` set to your UniNest UID.
   - Add a **Webget** pointing to
     `https://firestore.googleapis.com/v1/projects/uninest-ca9a6/databases/(default)/documents/publicWidgets/$gv(UID)$`
   - Parse the fields with `$wg(..., json, ...)$` KWGT functions.
4. Drag text layers for the current class, next class, and a list.

Tip: KWGT's community has UniNest-style templates — you can fork one and
just point it at your Webget URL. We've provided a starter JSON schema in
[`android_kwgt_mapping.md`](./android_kwgt_mapping.md) that matches our
Firestore document structure.

---

## Shared data shape

Regardless of platform, the widget consumes:

```jsonc
{
  "uid": "<firebase-uid>",
  "timetable": {
    "Monday":    [{ "id": 1, "course": "CBS1007", "title": "Database Systems – ETH",
                    "time": "08:00 AM", "duration": 1, "location": "PRP330" }],
    "Tuesday":   [...],
    "Wednesday": [...],
    "Thursday":  [...],
    "Friday":    [...],
    "Saturday":  [],
    "Sunday":    []
  },
  "updatedAt": "<iso timestamp>"
}
```

## Updating the widget data

The web app's `saveTimetable()` writes to `timetables/{uid}`. To power
native widgets (iOS Scriptable, Android KWGT), mirror the same payload to
`publicWidgets/{uid}` on every save. Either:
- **Cloud Function** (recommended) — triggers on `onWrite` of
  `timetables/{uid}` and copies to `publicWidgets/{uid}`, or
- **Client-side mirror** — add a `setDoc(doc(db, 'publicWidgets', uid), …)`
  next to your existing `timetables` write.

---

Questions? Issues? Open an issue in the UniNest repo or ping the maintainer.
