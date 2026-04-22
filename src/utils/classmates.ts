import { auth, getFriends, getFriendTimetable, type ClassItem, type UserProfile } from './firebase/firestore';

/**
 * Friend schedule loader with in-memory cache.
 *
 * Scope: a single browser session. Invalidates when the user logs in/out
 * (by tracking the current UID). Caches each friend's timetable so the
 * timetable page can show classmates without hammering Firestore.
 */

export interface ClassmateCandidate {
  uid: string;
  name: string;
  photoURL?: string;
  major?: string;
  year?: string;
}

interface CacheEntry {
  profile: ClassmateCandidate;
  schedule: Record<string, ClassItem[]>;
}

let currentOwnerUid: string | null = null;
let friendsList: ClassmateCandidate[] = [];
let friendsUnsub: (() => void) | null = null;
let scheduleCache: Map<string, CacheEntry> = new Map();
let loadingPromise: Promise<void> | null = null;
let lastLoadedAt = 0;

const STALE_AFTER_MS = 5 * 60 * 1000; // refresh schedule cache every 5 min

const resetCache = () => {
  if (friendsUnsub) {
    try { friendsUnsub(); } catch {}
    friendsUnsub = null;
  }
  friendsList = [];
  scheduleCache = new Map();
  loadingPromise = null;
  lastLoadedAt = 0;
};

const ensureFriendsSubscribed = () => {
  if (friendsUnsub) return;
  friendsUnsub = getFriends((list: any[]) => {
    friendsList = list.map((f) => ({
      uid: f.id || f.uid,
      name: f.name || f.displayName || 'Friend',
      photoURL: f.photoURL,
      major: f.major,
      year: f.year,
    }));
  });
};

const loadAll = async (): Promise<void> => {
  const uid = auth.currentUser?.uid || null;
  if (uid !== currentOwnerUid) {
    currentOwnerUid = uid;
    resetCache();
  }
  ensureFriendsSubscribed();

  const fresh = Date.now() - lastLoadedAt < STALE_AFTER_MS;
  if (fresh && scheduleCache.size >= friendsList.length && friendsList.length > 0) return;

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const snapshot = [...friendsList];
    // Load friend schedules in parallel; tolerate individual failures
    await Promise.all(
      snapshot.map(async (f) => {
        try {
          const schedule = await getFriendTimetable(f.uid);
          scheduleCache.set(f.uid, { profile: f, schedule: schedule || {} });
        } catch {
          scheduleCache.set(f.uid, { profile: f, schedule: {} });
        }
      })
    );
    lastLoadedAt = Date.now();
    loadingPromise = null;
  })();

  return loadingPromise;
};

/** Normalize a course code for robust matching. */
const normCode = (c: ClassItem | undefined | null): string => {
  if (!c) return '';
  const code = (c as any).course || (c as any).courseCode || '';
  return String(code).replace(/\s+/g, '').toUpperCase();
};

const normSlot = (c: ClassItem | undefined | null): string => {
  const slot = (c as any).slot || ((c as any).slots && (c as any).slots[0]) || '';
  return String(slot).toUpperCase();
};

const timeKey = (c: ClassItem | undefined | null): string => {
  return String((c as any).time || '').trim().toLowerCase();
};

/**
 * Given my class on a specific day, return friends who have a matching
 * class (same courseCode + same slot or same start time) on that day.
 */
export interface FindOpts {
  day: string; // e.g. "Monday"
  myClass: ClassItem;
}

export const findClassmates = async (opts: FindOpts): Promise<ClassmateCandidate[]> => {
  await loadAll();
  const targetCode = normCode(opts.myClass);
  const targetSlot = normSlot(opts.myClass);
  const targetTime = timeKey(opts.myClass);
  if (!targetCode && !targetSlot) return [];

  const matches: ClassmateCandidate[] = [];
  scheduleCache.forEach((entry) => {
    const classes = entry.schedule[opts.day] || [];
    const hit = classes.some((c) => {
      const codeMatch = normCode(c) && normCode(c) === targetCode;
      const slotMatch = targetSlot && normSlot(c) === targetSlot;
      const timeMatch = targetTime && timeKey(c) === targetTime;
      // Primary match: course code. If no code on either side, fall back to slot or time.
      if (codeMatch) return true;
      if (!targetCode) return slotMatch || timeMatch;
      return false;
    });
    if (hit) matches.push(entry.profile);
  });

  return matches;
};

/**
 * Synchronous helper that returns cached classmates only.
 * Triggers a background load if cache is cold so later calls are fast.
 */
export const findClassmatesCached = (opts: FindOpts): ClassmateCandidate[] => {
  // Kick a background load but don't await
  void loadAll();
  const targetCode = normCode(opts.myClass);
  const targetSlot = normSlot(opts.myClass);
  const targetTime = timeKey(opts.myClass);
  if (!targetCode && !targetSlot) return [];

  const matches: ClassmateCandidate[] = [];
  scheduleCache.forEach((entry) => {
    const classes = entry.schedule[opts.day] || [];
    const hit = classes.some((c) => {
      const codeMatch = normCode(c) && normCode(c) === targetCode;
      const slotMatch = targetSlot && normSlot(c) === targetSlot;
      const timeMatch = targetTime && timeKey(c) === targetTime;
      if (codeMatch) return true;
      if (!targetCode) return slotMatch || timeMatch;
      return false;
    });
    if (hit) matches.push(entry.profile);
  });
  return matches;
};

/** Manual invalidation (call on logout). */
export const invalidateClassmateCache = () => resetCache();
