/*
 * UniNest iOS Widget — Scriptable.app
 * ====================================
 *
 * Renders your UniNest timetable as a NATIVE iOS home-screen widget
 * via Scriptable (https://scriptable.app). No App Store submission needed.
 *
 * SETUP (one-time, ~2 minutes):
 *   1. Install "Scriptable" from the App Store.
 *   2. Open Scriptable → "+" → paste this entire file → name it "UniNest".
 *   3. Set CONFIG.uid below to your UniNest user UID (get it from the
 *      UniNest web app → Profile → copy UID). OR leave it to read from
 *      the widget's parameter field.
 *   4. Add a "Scriptable" widget to your Home Screen, long-press → "Edit Widget"
 *      → Script: UniNest → Widget Parameter: <your-uid> → done.
 *
 * The widget calls Firestore's public REST API to fetch your timetable
 * document. For this to work you must either:
 *   a) Open Firestore security rules so authenticated reads of the
 *      `timetables/{uid}` doc are allowed (the standard case), AND
 *      supply an ID token via CONFIG.idToken below, OR
 *   b) Expose a sanitized read-only snapshot of the timetable at a
 *      public path like `public/widgets/{uid}` and set CONFIG.publicPath.
 *      (Recommended — see /app/widgets/README.md for setup.)
 */

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const CONFIG = {
  // Firebase project ID of your UniNest deployment.
  projectId: 'uninest-ca9a6',

  // Option A — authenticated read (less setup but requires refreshing ID token).
  // idToken: '<paste-a-firebase-id-token>',

  // Option B — public snapshot (recommended, see README).
  // The UniNest app will mirror your `timetables/{uid}` doc into this path
  // whenever you save changes, so no auth token is required.
  publicCollection: 'publicWidgets',

  // Pulled from Scriptable widget parameter (long-press widget → Edit → Parameter).
  // Fallback to this string for development.
  defaultUid: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseTimeToMinutes(t) {
  if (!t) return 24 * 60;
  const s = String(t).trim().toUpperCase();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return 24 * 60;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3];
  if (ampm === 'AM' && h === 12) h = 0;
  else if (ampm === 'PM' && h !== 12) h += 12;
  return h * 60 + min;
}

function fmtTime(mins) {
  const h24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
}

// Firestore REST → decode its verbose JSON value format into plain values.
function decodeValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) {
    const obj = {};
    const fields = v.mapValue.fields || {};
    for (const k of Object.keys(fields)) obj[k] = decodeValue(fields[k]);
    return obj;
  }
  if ('nullValue' in v) return null;
  return null;
}

async function fetchTimetable(uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents/${CONFIG.publicCollection}/${uid}`;
  const req = new Request(url);
  if (CONFIG.idToken) req.headers = { Authorization: `Bearer ${CONFIG.idToken}` };
  const json = await req.loadJSON();
  if (!json || !json.fields) return {};
  const data = decodeValue({ mapValue: { fields: json.fields } });
  return data?.timetable || {};
}

// ---------------------------------------------------------------------------
// Widget rendering
// ---------------------------------------------------------------------------

function sortedToday(timetable) {
  const today = DAY_NAMES[new Date().getDay()];
  const list = [...(timetable[today] || [])];
  list.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
  return { today, list };
}

function partition(list) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  let ongoing = null;
  let next = null;
  for (const c of list) {
    const start = parseTimeToMinutes(c.time);
    const end = start + Math.round((Number(c.duration) || 1) * 60);
    if (nowMin >= start && nowMin < end) ongoing = c;
    else if (start > nowMin && !next) next = c;
  }
  return { ongoing, next };
}

function makeWidget(timetable) {
  const { today, list } = sortedToday(timetable);
  const { ongoing, next } = partition(list);

  const w = new ListWidget();
  // Gradient background — UniNest sky→cyan
  const grad = new LinearGradient();
  grad.colors = [new Color('#0369a1'), new Color('#06b6d4')];
  grad.locations = [0, 1];
  w.backgroundGradient = grad;
  w.setPadding(14, 14, 14, 14);

  // Header
  const headerRow = w.addStack();
  headerRow.layoutHorizontally();
  const title = headerRow.addText('UniNest');
  title.font = Font.boldSystemFont(10);
  title.textColor = new Color('#ffffff');
  title.textOpacity = 0.8;
  headerRow.addSpacer();
  const dateStr = headerRow.addText(today);
  dateStr.font = Font.boldSystemFont(10);
  dateStr.textColor = new Color('#ffffff');
  dateStr.textOpacity = 0.8;

  w.addSpacer(6);

  // Family determines what we show
  const family = config.widgetFamily || 'medium';

  if (family === 'small') {
    const headline = ongoing || next;
    if (!headline) {
      const t = w.addText('No classes today');
      t.font = Font.semiboldSystemFont(13);
      t.textColor = new Color('#ffffff');
      return w;
    }
    const label = w.addText(ongoing ? 'NOW' : 'NEXT');
    label.font = Font.boldSystemFont(9);
    label.textColor = new Color('#ffffff');
    label.textOpacity = 0.8;
    w.addSpacer(2);
    const courseText = w.addText(String(headline.course || headline.title || ''));
    courseText.font = Font.boldSystemFont(15);
    courseText.textColor = new Color('#ffffff');
    courseText.lineLimit = 2;
    w.addSpacer(4);
    const when = w.addText(fmtTime(parseTimeToMinutes(headline.time)));
    when.font = Font.systemFont(10);
    when.textColor = new Color('#ffffff');
    when.textOpacity = 0.9;
    if (headline.location) {
      const loc = w.addText('📍 ' + headline.location);
      loc.font = Font.systemFont(10);
      loc.textColor = new Color('#ffffff');
      loc.textOpacity = 0.85;
    }
    return w;
  }

  // Medium / Large: two-column Now + Next
  const row = w.addStack();
  row.layoutHorizontally();
  row.spacing = 8;

  const mkTile = (label, cls) => {
    const tile = row.addStack();
    tile.layoutVertically();
    tile.backgroundColor = new Color('#ffffff', 0.18);
    tile.cornerRadius = 14;
    tile.setPadding(8, 10, 8, 10);
    tile.size = new Size(family === 'small' ? 140 : 140, 70);

    const lbl = tile.addText(label);
    lbl.font = Font.boldSystemFont(9);
    lbl.textColor = new Color('#ffffff');
    lbl.textOpacity = 0.85;

    if (cls) {
      const name = tile.addText(String(cls.course || cls.title || ''));
      name.font = Font.boldSystemFont(13);
      name.textColor = new Color('#ffffff');
      name.lineLimit = 1;
      const when = tile.addText(fmtTime(parseTimeToMinutes(cls.time)));
      when.font = Font.systemFont(10);
      when.textColor = new Color('#ffffff');
      when.textOpacity = 0.9;
    } else {
      const empty = tile.addText(label === 'NOW' ? 'On break' : 'All done');
      empty.font = Font.semiboldSystemFont(11);
      empty.textColor = new Color('#ffffff');
      empty.textOpacity = 0.85;
    }
  };

  mkTile('NOW', ongoing);
  mkTile('NEXT', next);

  if (family === 'large') {
    w.addSpacer(10);
    const listLabel = w.addText(`Today · ${list.length} session${list.length === 1 ? '' : 's'}`);
    listLabel.font = Font.boldSystemFont(10);
    listLabel.textColor = new Color('#ffffff');
    listLabel.textOpacity = 0.85;
    w.addSpacer(4);
    const capped = list.slice(0, 6);
    for (const cls of capped) {
      const rowItem = w.addStack();
      rowItem.layoutHorizontally();
      rowItem.backgroundColor = new Color('#ffffff', 0.12);
      rowItem.cornerRadius = 10;
      rowItem.setPadding(6, 8, 6, 8);
      rowItem.spacing = 6;

      const timeTxt = rowItem.addText(fmtTime(parseTimeToMinutes(cls.time)));
      timeTxt.font = Font.boldSystemFont(10);
      timeTxt.textColor = new Color('#ffffff');
      timeTxt.textOpacity = 0.9;

      rowItem.addSpacer(4);

      const nameTxt = rowItem.addText(String(cls.course || cls.title || ''));
      nameTxt.font = Font.semiboldSystemFont(11);
      nameTxt.textColor = new Color('#ffffff');
      nameTxt.lineLimit = 1;

      rowItem.addSpacer();

      if (cls.location) {
        const locTxt = rowItem.addText(String(cls.location));
        locTxt.font = Font.systemFont(9);
        locTxt.textColor = new Color('#ffffff');
        locTxt.textOpacity = 0.75;
      }
      w.addSpacer(3);
    }
  }

  return w;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const uid = (args.widgetParameter && args.widgetParameter.trim()) || CONFIG.defaultUid;
if (!uid) {
  const w = new ListWidget();
  w.addText('Set widget parameter to your UniNest UID.');
  Script.setWidget(w);
  Script.complete();
} else {
  try {
    const tt = await fetchTimetable(uid);
    const widget = makeWidget(tt);
    Script.setWidget(widget);
    if (!config.runsInWidget) await widget.presentMedium();
    Script.complete();
  } catch (err) {
    const w = new ListWidget();
    const t = w.addText('UniNest: failed to load.');
    t.textColor = new Color('#ffffff');
    w.backgroundColor = new Color('#ef4444');
    const e = w.addText(String(err).slice(0, 120));
    e.textColor = new Color('#ffffff');
    e.font = Font.systemFont(9);
    Script.setWidget(w);
    Script.complete();
  }
}
