/**
 * FFCS Timetable Parser
 * ---------------------
 * Robust parser for VIT-style FFCS timetable text.
 * Handles noisy input, repeated blocks, and merges consecutive slots.
 *
 * Public API:
 *   parseFFCSTimetable(rawText, opts?) -> FFCSTimetable
 *   ffcsToParsedClasses(timetable)     -> ParsedClass[]
 *   formatTimeRange(start, end)        -> "08:00 AM – 08:50 AM"
 *   to12h(hhmm)                        -> "08:00 AM"
 *   nextUpcoming(timetable, now?)      -> FFCSEvent | null
 *   currentOngoing(timetable, now?)    -> FFCSEvent | null
 *   freeSlotsForDay(events, bounds?)   -> { start, end }[]
 */

import type { ParsedClass } from './timetableParser';

// ---------------------------------------------------------------------------
// 1. Fixed slot → time mappings
// ---------------------------------------------------------------------------

export const THEORY_SLOTS: Record<string, { start: string; end: string }> = {
  A1: { start: '08:00', end: '08:50' },
  F1: { start: '09:00', end: '09:50' },
  D1: { start: '10:00', end: '10:50' },
  TB1: { start: '11:00', end: '11:50' },
  TG1: { start: '12:00', end: '12:50' },
  A2: { start: '14:00', end: '14:50' },
  F2: { start: '15:00', end: '15:50' },
  D2: { start: '16:00', end: '16:50' },
  TB2: { start: '17:00', end: '17:50' },
  TG2: { start: '18:00', end: '18:50' },
};

export const LAB_SLOTS: Record<string, { start: string; end: string }> = {
  L1: { start: '08:00', end: '08:50' },
  L2: { start: '08:51', end: '09:40' },
  L3: { start: '09:51', end: '10:40' },
  L4: { start: '10:41', end: '11:30' },
  L5: { start: '11:40', end: '12:30' },
  L6: { start: '12:31', end: '13:20' },
  L31: { start: '14:00', end: '14:50' },
  L32: { start: '14:51', end: '15:40' },
  L33: { start: '15:51', end: '16:40' },
  L34: { start: '16:41', end: '17:30' },
  L35: { start: '17:40', end: '18:30' },
  L36: { start: '18:31', end: '19:20' },
};

// Merged lookup — theory first, then lab (keys don't overlap).
const SLOT_MAP: Record<string, { start: string; end: string; kind: 'THEORY' | 'LAB' }> = {};
for (const [k, v] of Object.entries(THEORY_SLOTS)) SLOT_MAP[k] = { ...v, kind: 'THEORY' };
for (const [k, v] of Object.entries(LAB_SLOTS)) SLOT_MAP[k] = { ...v, kind: 'LAB' };

// ---------------------------------------------------------------------------
// 2. Course code → readable name mapping (extensible)
// ---------------------------------------------------------------------------

export const COURSE_NAMES: Record<string, string> = {
  CBS1007: 'Database Systems',
  MGT2003: 'Financial Management',
  CBS3003: 'Design and Analysis of Algorithms',
  CBS2003: 'Design Thinking',
  ENG1018: 'Business Communication',
  FRE1001: 'Francais quotidien',
  CBS3001: 'Computer Networks',
};

// ---------------------------------------------------------------------------
// 3. Types
// ---------------------------------------------------------------------------

export type FFCSEvent = {
  courseName?: string;
  courseCode: string;
  type: string; // ETH | TH | ELA | ...
  room: string;
  startTime: string; // "HH:MM" 24-hour
  endTime: string;   // "HH:MM" 24-hour
  slots: string[];   // merged slot ids, e.g. ["L33", "L34"]
  kind: 'THEORY' | 'LAB';
};

export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type FFCSTimetable = Partial<Record<Day, FFCSEvent[]>>;

export type ParseOptions = {
  /** Extra course-code → name overrides (merged on top of the defaults). */
  courseNames?: Record<string, string>;
  /** Tolerance (minutes) allowed between adjacent slots for merging. Default = 1. */
  mergeGapMinutes?: number;
};

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

const DAYS: Day[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_REGEX = /^(MON|TUE|WED|THU|FRI|SAT|SUN)$/i;

// Cell format: SLOT-CODE-TYPE-ROOM-GROUP
// Example: A1-CBS1007-ETH-PRP330-UGS  or  L33-CBS2003-ELA-PRP356-UGS
const CELL_REGEX =
  /([A-Z]{1,4}\d{1,3})-([A-Z]{2,5}\d{3,5})-([A-Z]{1,5})-([A-Z0-9]+)-([A-Z0-9]+)/g;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function to12h(hhmm: string): string {
  const [hStr, m] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${to12h(start)} – ${to12h(end)}`;
}

// ---------------------------------------------------------------------------
// 5. Core parser
// ---------------------------------------------------------------------------

type RawCell = {
  day: Day;
  slot: string;
  courseCode: string;
  type: string;
  room: string;
  start: string;
  end: string;
  kind: 'THEORY' | 'LAB';
};

/**
 * Normalize the input — compact whitespace around dashes in cell patterns
 * so OCR-style noise doesn't break the regex.
 */
function normalizeText(raw: string): string {
  return raw
    // Remove soft spaces around dashes between alphanumeric tokens (OCR artifact)
    .replace(/([A-Z0-9])\s*-\s*([A-Z0-9])/g, '$1-$2')
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    // Collapse trailing spaces
    .replace(/[ \t]+/g, ' ');
}

/**
 * Extract every cell in the text, tracking the most recently seen day.
 * Bypasses column-based alignment entirely — we rely on slot identity.
 */
function extractRawCells(rawText: string): RawCell[] {
  const normalized = normalizeText(rawText);
  const tokens = normalized.split(/[\s\t]+/).filter(Boolean);

  let currentDay: Day | null = null;
  const cells: RawCell[] = [];
  const dedup = new Set<string>();

  for (const token of tokens) {
    const up = token.toUpperCase();

    // Day marker: update state, do not consume
    if (DAY_REGEX.test(up)) {
      currentDay = up as Day;
      continue;
    }

    // Reset regex lastIndex because /g is stateful
    CELL_REGEX.lastIndex = 0;
    // A single token may contain exactly one cell; exec once.
    const m = CELL_REGEX.exec(token);
    if (!m) continue;

    const [, slot, courseCode, type, room] = m;
    const slotInfo = SLOT_MAP[slot.toUpperCase()];
    if (!slotInfo) continue; // Unknown slot — skip silently
    if (!currentDay) continue; // Cell before any day marker — skip

    const key = `${currentDay}|${slot}|${courseCode}|${room}`;
    if (dedup.has(key)) continue;
    dedup.add(key);

    cells.push({
      day: currentDay,
      slot: slot.toUpperCase(),
      courseCode: courseCode.toUpperCase(),
      type: type.toUpperCase(),
      room: room.toUpperCase(),
      start: slotInfo.start,
      end: slotInfo.end,
      kind: slotInfo.kind,
    });
  }

  return cells;
}

/**
 * Merge contiguous cells that share courseCode + room.
 * Two cells are contiguous when the gap between end(prev) and start(next)
 * is ≤ mergeGapMinutes (default 1 — handles L33 (…:40) → L34 (…:41)).
 */
function mergeCells(
  dayCells: RawCell[],
  mergeGapMinutes: number,
  courseNames: Record<string, string>,
): FFCSEvent[] {
  // Group by courseCode + room
  const groups = new Map<string, RawCell[]>();
  for (const c of dayCells) {
    const key = `${c.courseCode}|${c.room}`;
    const list = groups.get(key) || [];
    list.push(c);
    groups.set(key, list);
  }

  const events: FFCSEvent[] = [];

  for (const list of groups.values()) {
    list.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

    let current: FFCSEvent | null = null;
    for (const c of list) {
      if (
        current &&
        toMinutes(c.start) - toMinutes(current.endTime) <= mergeGapMinutes &&
        // prevent merging across lunch or large gaps — only when truly contiguous
        toMinutes(c.start) - toMinutes(current.endTime) >= 0
      ) {
        current.endTime = c.end;
        current.slots.push(c.slot);
      } else {
        if (current) events.push(current);
        current = {
          courseName: courseNames[c.courseCode],
          courseCode: c.courseCode,
          type: c.type,
          room: c.room,
          startTime: c.start,
          endTime: c.end,
          slots: [c.slot],
          kind: c.kind,
        };
      }
    }
    if (current) events.push(current);
  }

  // Sort the day's events chronologically
  events.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  return events;
}

/**
 * Main entry — parse raw timetable text into a day-wise structured schedule.
 */
export function parseFFCSTimetable(rawText: string, opts?: ParseOptions): FFCSTimetable {
  const courseNames = { ...COURSE_NAMES, ...(opts?.courseNames || {}) };
  const mergeGap = opts?.mergeGapMinutes ?? 1;

  const cells = extractRawCells(rawText);

  const byDay: Partial<Record<Day, RawCell[]>> = {};
  for (const c of cells) {
    (byDay[c.day] ||= []).push(c);
  }

  const result: FFCSTimetable = {};
  for (const day of DAYS) {
    const list = byDay[day];
    if (!list || list.length === 0) continue;
    result[day] = mergeCells(list, mergeGap, courseNames);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 6. Conversion helper — feed existing save pipeline
// ---------------------------------------------------------------------------

export function ffcsToParsedClasses(timetable: FFCSTimetable): ParsedClass[] {
  const out: ParsedClass[] = [];
  for (const day of DAYS) {
    const list = timetable[day] || [];
    for (const ev of list) {
      out.push({
        day,
        startTime: ev.startTime,
        endTime: ev.endTime,
        courseCode: ev.courseCode,
        classType: ev.kind === 'LAB' ? 'Lab' : 'Theory',
        location: ev.room,
        // Extra metadata (non-breaking additions)
        rawType: ev.type,
        courseName: ev.courseName,
        slots: ev.slots,
      } as ParsedClass);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. Bonus helpers — ongoing / upcoming / free slots
// ---------------------------------------------------------------------------

function getDayCode(date: Date): Day {
  return DAYS[(date.getDay() + 6) % 7]; // Mon=0 ... Sun=6
}

/** Find the class currently happening (if any). */
export function currentOngoing(timetable: FFCSTimetable, now: Date = new Date()): FFCSEvent | null {
  const day = getDayCode(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const events = timetable[day] || [];
  for (const ev of events) {
    const s = toMinutes(ev.startTime);
    const e = toMinutes(ev.endTime);
    if (minutes >= s && minutes < e) return ev;
  }
  return null;
}

/** Find the next upcoming class today (or null if none). */
export function nextUpcoming(timetable: FFCSTimetable, now: Date = new Date()): FFCSEvent | null {
  const day = getDayCode(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const events = timetable[day] || [];
  for (const ev of events) {
    if (toMinutes(ev.startTime) > minutes) return ev;
  }
  return null;
}

/** Return free-time windows between events for a given day. */
export function freeSlotsForDay(
  events: FFCSEvent[],
  bounds: { start?: string; end?: string } = {},
): Array<{ start: string; end: string }> {
  const dayStart = toMinutes(bounds.start || '08:00');
  const dayEnd = toMinutes(bounds.end || '19:30');
  const sorted = [...events].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  const windows: Array<{ start: string; end: string }> = [];
  let cursor = dayStart;

  const fmt = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  for (const ev of sorted) {
    const s = toMinutes(ev.startTime);
    const e = toMinutes(ev.endTime);
    if (s > cursor) windows.push({ start: fmt(cursor), end: fmt(s) });
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) windows.push({ start: fmt(cursor), end: fmt(dayEnd) });
  return windows;
}
