# Android KWGT Mapping · UniNest Timetable

This document shows how to wire a KWGT widget to your UniNest Firestore
data. You will create a KWGT widget that pulls a small JSON document from
Firestore's REST API and renders today's classes.

## 1 · Firestore public snapshot (one-time)

Your primary timetable is stored at `timetables/{uid}`. Widgets without
Firebase auth cannot read it directly, so we mirror a sanitised copy to
`publicWidgets/{uid}`.

### Security rule
```
match /publicWidgets/{uid} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

### Web app mirror (add to `saveTimetable`)
```ts
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

await setDoc(doc(db, 'publicWidgets', uid), {
  uid,
  timetable,
  updatedAt: serverTimestamp(),
});
```

## 2 · KWGT Webget URL

```
https://firestore.googleapis.com/v1/projects/uninest-ca9a6/databases/(default)/documents/publicWidgets/$gv(UID)$
```

Set `$gv(UID)$` (a KWGT global variable) to your UniNest UID. You can grab
your UID from the UniNest web app: **Profile** → top-right (coming soon),
or the browser console: `firebase.auth().currentUser.uid`.

## 3 · Parsing today's classes

Firestore REST returns a verbose shape. Here's the mapping you want:

| What you want | KWGT formula |
|---|---|
| Raw JSON | `$wg(WEBGET_INDEX, ecget)$` |
| Today's day name | `$df(EEEE)$` (e.g. `Monday`) |
| Today's class count | `$wg(WEBGET_INDEX, json, fields/timetable/mapValue/fields/$df(EEEE)$/arrayValue/values/#)$` |
| First class course code | `$wg(WEBGET_INDEX, json, fields/timetable/mapValue/fields/$df(EEEE)$/arrayValue/values/0/mapValue/fields/course/stringValue)$` |
| First class time | `$wg(…/0/mapValue/fields/time/stringValue)$` |
| First class location | `$wg(…/0/mapValue/fields/location/stringValue)$` |

Replace `0` with `1`, `2`, … for subsequent rows.

### Tip: loop using KWGT's formula engine

KWGT supports simple loops via `$tc(split, …)$` and list containers.
The simplest approach:
1. Add a **List** layer (vertical).
2. Set its **Items** to the class count formula above.
3. Inside the list cell, use the index variable `$li(i)$` in place of `0`
   in each field, e.g.
   `$wg(…/$li(i)$/mapValue/fields/course/stringValue)$`.

## 4 · Styling suggestions

Match the in-app UniNest aesthetic:
- Background: linear gradient `#0369a1 → #06b6d4`, corner radius `32dp`.
- Font: Outfit (already used in UniNest). Weights 700 / 800.
- "Now" badge: pulsing white dot in front of the current class.
- "Next" badge: solid white dot, 70% opacity.

## 5 · Tasker alternative (advanced)

If you'd rather build the widget in Tasker + AutoTools:
1. Use **HTTP Request** action with the same Webget URL.
2. Parse JSON with `JSON Read`.
3. Feed values to **AutoTools Widget** via variables.
4. Schedule refresh every 10 min with a Time context.
