import type { ClassItem } from '../utils/firebase/firestore';

/** Day keys used throughout the app. */
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;
export type DayKey = typeof WEEKDAYS[number];

/** Interval in minutes since midnight: [start, end). */
export interface Interval {
  start: number;
  end: number;
}

/** Human-friendly slot in "HH:MM" 24h format. */
export interface Slot {
  start: string;
  end: string;
}

const HHMM = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

/**
 * Parse a time string like "9:00 AM", "08:00 AM", "14:30", or a range "09:00-10:00"
 * into minutes since midnight. Returns NaN on failure.
 */
export const parseTimeToMinutes = (input: string | undefined | null): number => {
  if (!input) return NaN;
  const raw = input.trim();

  // 12h format: "9:00 AM" / "12:30 pm"
  const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let hh = parseInt(m12[1], 10);
    const mm = parseInt(m12[2], 10);
    const ap = m12[3].toUpperCase();
    if (ap === 'AM' && hh === 12) hh = 0;
    if (ap === 'PM' && hh !== 12) hh += 12;
    return hh * 60 + mm;
  }

  // 24h format: "14:30" or "09:00"
  const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  }

  return NaN;
};

/**
 * Extract [start, end) in minutes for a ClassItem.
 * Supports:
 *  - `time: "9:00 AM"` + `duration` hours
 *  - `time: "09:00-10:00"` explicit range
 */
export const classItemToInterval = (c: ClassItem): Interval | null => {
  if (!c || !c.time) return null;
  const timeStr = (c.time || '').trim();

  // Range form: "09:00-10:00" or "9:00 AM - 10:00 AM"
  if (timeStr.includes('-')) {
    const [a, b] = timeStr.split('-').map((s) => s.trim());
    const start = parseTimeToMinutes(a);
    const end = parseTimeToMinutes(b);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return { start, end };
    }
  }

  // Point + duration
  const start = parseTimeToMinutes(timeStr);
  if (!Number.isFinite(start)) return null;
  const dur = Number(c.duration);
  const end = start + (Number.isFinite(dur) && dur > 0 ? dur * 60 : 60);
  return { start, end };
};

/** Merge overlapping/adjacent intervals into a sorted list. */
export const mergeIntervals = (list: Interval[]): Interval[] => {
  if (list.length === 0) return [];
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const curr = sorted[i];
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      out.push({ ...curr });
    }
  }
  return out;
};

/**
 * Given two users' busy intervals for a single day, return free gaps
 * within [windowStart, windowEnd) that are at least `minLenMin` long.
 */
export const findFreeSlots = (
  userA: Interval[],
  userB: Interval[],
  windowStart: number,
  windowEnd: number,
  minLenMin: number
): Interval[] => {
  const busy = mergeIntervals([...userA, ...userB])
    .map((i) => ({
      start: Math.max(i.start, windowStart),
      end: Math.min(i.end, windowEnd),
    }))
    .filter((i) => i.end > i.start);

  const merged = mergeIntervals(busy);
  const free: Interval[] = [];
  let cursor = windowStart;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });

  return free.filter((i) => i.end - i.start >= minLenMin);
};

/** Build busy intervals by day from a timetable map. */
export const timetableToBusyByDay = (
  timetable: Record<string, ClassItem[] | undefined>
): Record<DayKey, Interval[]> => {
  const out: Record<DayKey, Interval[]> = {
    MON: [], TUE: [], WED: [], THU: [], FRI: [],
  };
  for (const day of WEEKDAYS) {
    const classes = timetable[day] || [];
    for (const c of classes) {
      const iv = classItemToInterval(c);
      if (iv) out[day].push(iv);
    }
  }
  return out;
};

/**
 * Compute common free slots between two users for MON-FRI.
 */
export const computeCommonFreeSlots = (
  mineTimetable: Record<string, ClassItem[] | undefined>,
  friendTimetable: Record<string, ClassItem[] | undefined>,
  opts?: { windowStart?: number; windowEnd?: number; minLenMin?: number }
): Record<DayKey, Slot[]> => {
  const windowStart = opts?.windowStart ?? 8 * 60; // 08:00
  const windowEnd = opts?.windowEnd ?? 20 * 60;   // 20:00
  const minLenMin = opts?.minLenMin ?? 30;

  const mine = timetableToBusyByDay(mineTimetable);
  const friend = timetableToBusyByDay(friendTimetable);

  const result = {} as Record<DayKey, Slot[]>;
  for (const day of WEEKDAYS) {
    const free = findFreeSlots(mine[day], friend[day], windowStart, windowEnd, minLenMin);
    result[day] = free.map((iv) => ({ start: HHMM(iv.start), end: HHMM(iv.end) }));
  }
  return result;
};

/** "08:15" → "8:15 AM"; pretty 12h label for UI. */
export const formatTimeLabel = (hhmm: string): string => {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ap}`;
};

/** "1h 30m" / "45m" style duration label from a Slot. */
export const formatDuration = (slot: Slot): string => {
  const start = parseTimeToMinutes(slot.start);
  const end = parseTimeToMinutes(slot.end);
  const mins = Math.max(0, end - start);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

/** Current weekday key MON-FRI, or null if weekend. */
export const getTodayKey = (): DayKey | null => {
  const idx = new Date().getDay(); // 0 = Sun ... 6 = Sat
  const map: Record<number, DayKey | null> = {
    0: null, 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: null,
  };
  return map[idx];
};

/** Pick the longest free slot across the week — "best meeting time" suggestion. */
export const suggestBestSlot = (
  freeByDay: Record<DayKey, Slot[]>
): { day: DayKey; slot: Slot } | null => {
  let best: { day: DayKey; slot: Slot; len: number } | null = null;
  for (const day of WEEKDAYS) {
    for (const s of freeByDay[day] || []) {
      const len = parseTimeToMinutes(s.end) - parseTimeToMinutes(s.start);
      if (!best || len > best.len) best = { day, slot: s, len };
    }
  }
  return best ? { day: best.day, slot: best.slot } : null;
};
