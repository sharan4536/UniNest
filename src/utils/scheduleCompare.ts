import type { ClassItem } from '../utils/firebase/firestore'; 
 
 /** -------------------- TYPES -------------------- */ 
 
 export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const; 
 export type DayKey = typeof WEEKDAYS[number]; 
 
 export interface Interval { 
   start: number; // minutes 
   end: number;   // minutes 
 } 
 
 export interface Slot { 
   start: string; // "HH:MM" 
   end: string; 
 } 
 
 /** -------------------- HELPERS -------------------- */ 
 
 const HHMM = (mins: number): string => { 
   const h = Math.floor(mins / 60) % 24; 
   const m = mins % 60; 
   return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; 
 }; 
 
 /** Parse time string → minutes */ 
 export const parseTimeToMinutes = (input?: string | null): number => { 
   if (!input) return NaN; 
 
   const raw = input.trim().toUpperCase().replace(/\s+/g, ' '); 
 
   // 12h format: "9:00 AM", "12:30 PM", "10 AM"
   const m12 = raw.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/); 
   if (m12) { 
     let hh = Number(m12[1]); 
     const mm = m12[2] ? Number(m12[2]) : 0; 
     const ap = m12[3]; 
 
     if (hh < 1 || hh > 12 || mm > 59) return NaN; 
 
     if (ap === 'AM' && hh === 12) hh = 0; 
     if (ap === 'PM' && hh !== 12) hh += 12; 
 
     return hh * 60 + mm; 
   } 
 
   // 24h format 
   const m24 = raw.match(/^(\d{1,2}):(\d{2})$/); 
   if (m24) { 
     const hh = Number(m24[1]); 
     const mm = Number(m24[2]); 
 
     if (hh > 23 || mm > 59) return NaN; 
 
     return hh * 60 + mm; 
   } 
 
   return NaN; 
 }; 
 
 /** Convert class → interval */ 
 export const classItemToInterval = (c: ClassItem): Interval | null => { 
   if (!c?.time) return null; 
 
   const timeStr = c.time.trim(); 
 
   // Range format 
   if (timeStr.includes('-')) { 
     const [a, b] = timeStr.split('-').map(s => s.trim()); 
 
     const start = parseTimeToMinutes(a); 
     const end = parseTimeToMinutes(b); 
 
     if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { 
       return null; 
     } 
 
     return { start, end }; 
   } 
 
   // Single time + duration 
   const start = parseTimeToMinutes(timeStr); 
   if (!Number.isFinite(start)) return null; 
 
   const duration = Number(c.duration); 
   const end = start + (duration > 0 ? duration * 60 : 60); 
 
   return { start, end }; 
 }; 
 
 /** Merge intervals */ 
 export const mergeIntervals = (list: Interval[]): Interval[] => { 
   if (!list.length) return []; 
 
   const sorted = [...list].sort((a, b) => a.start - b.start); 
   const result: Interval[] = [sorted[0]]; 
 
   for (let i = 1; i < sorted.length; i++) { 
     const last = result[result.length - 1]; 
     const curr = sorted[i]; 
 
     if (curr.start <= last.end) { 
       last.end = Math.max(last.end, curr.end); 
     } else { 
       result.push({ ...curr }); 
     } 
   } 
 
   return result; 
 }; 
 
 /** -------------------- CORE LOGIC -------------------- */ 
 
 /** Faster interval intersection (O(n log n)) */ 
 const intersectIntervals = (a: Interval[], b: Interval[]): Interval[] => { 
   const A = mergeIntervals(a); 
   const B = mergeIntervals(b); 
 
   const result: Interval[] = []; 
   let i = 0, j = 0; 
 
   while (i < A.length && j < B.length) { 
     const start = Math.max(A[i].start, B[j].start); 
     const end = Math.min(A[i].end, B[j].end); 
 
     if (end > start) result.push({ start, end }); 
 
     if (A[i].end < B[j].end) i++; 
     else j++; 
   } 
 
   return result; 
 }; 
 
 /** Build busy intervals by day */ 
 export const timetableToBusyByDay = ( 
   data: any 
 ): Record<DayKey, Interval[]> => { 
   const out: Record<DayKey, Interval[]> = { 
     MON: [], TUE: [], WED: [], THU: [], FRI: [], 
   }; 
 
   if (!data) return out; 
 
   const timetable = data.timetable || data; 
 
   // Helper to find day data regardless of key format (MON vs Monday, case-insensitive)
   const getClassesForDay = (day: DayKey): ClassItem[] => {
     const dayFull = {
       MON: 'MONDAY', TUE: 'TUESDAY', WED: 'WEDNESDAY', THU: 'THURSDAY', FRI: 'FRIDAY'
     }[day];
     
     const keys = Object.keys(timetable);
     const targetKey = keys.find(k => {
       const uk = k.toUpperCase();
       return uk === day || uk === dayFull || uk.startsWith(day);
     });
     
     return targetKey ? (timetable[targetKey] || []) : [];
   };
 
   for (const day of WEEKDAYS) { 
     const classes = getClassesForDay(day); 
 
     for (const c of classes) { 
       const iv = classItemToInterval(c); 
       if (iv) out[day].push(iv); 
     } 
 
     out[day] = mergeIntervals(out[day]); // normalize early 
   } 
 
   return out; 
 }; 
 
 /** Find free slots */ 
 export const findFreeSlots = ( 
   userA: Interval[], 
   userB: Interval[], 
   windowStart: number, 
   windowEnd: number, 
   minLenMin: number 
 ): Interval[] => { 
 
   const busy = mergeIntervals([...userA, ...userB]); 
 
   const free: Interval[] = []; 
   let cursor = windowStart; 
 
   for (const b of busy) { 
     if (b.start > cursor) { 
       free.push({ start: cursor, end: b.start }); 
     } 
     cursor = Math.max(cursor, b.end); 
   } 
 
   // ✅ EXTEND AFTER LAST CLASS 
   if (cursor < windowEnd) { 
     free.push({ start: cursor, end: windowEnd }); 
   } 
 
   return free.filter(i => (i.end - i.start) >= minLenMin); 
 }; 
 
 /** -------------------- FEATURES -------------------- */ 
 
 /** Busy together */ 
 export const computeBusyTogetherSlots = ( 
   mine: Record<string, ClassItem[] | undefined>, 
   friend: Record<string, ClassItem[] | undefined> 
 ): Record<DayKey, Slot[]> => { 
   const m = timetableToBusyByDay(mine); 
   const f = timetableToBusyByDay(friend); 
 
   const result = {} as Record<DayKey, Slot[]>; 
 
   for (const day of WEEKDAYS) { 
     const inter = intersectIntervals(m[day], f[day]); 
 
     result[day] = inter.map(iv => ({ 
       start: HHMM(iv.start), 
       end: HHMM(iv.end), 
     })); 
   } 
 
   return result; 
 }; 
 
 /** Mutual free time */ 
 export const computeCommonFreeSlots = ( 
   mine: Record<string, ClassItem[] | undefined>, 
   friend: Record<string, ClassItem[] | undefined>, 
   opts?: { windowStart?: number; windowEnd?: number; minLenMin?: number } 
 ): Record<DayKey, Slot[]> => { 
 
   const windowStart = opts?.windowStart ?? 8 * 60; 
   const windowEnd = opts?.windowEnd ?? 20 * 60; 
   const minLenMin = opts?.minLenMin ?? 30; 
 
   const m = timetableToBusyByDay(mine); 
   const f = timetableToBusyByDay(friend); 
 
   const result = {} as Record<DayKey, Slot[]>; 
 
   for (const day of WEEKDAYS) { 
     const free = findFreeSlots(m[day], f[day], windowStart, windowEnd, minLenMin); 
 
     result[day] = free.map(iv => ({ 
       start: HHMM(iv.start), 
       end: HHMM(iv.end), 
     })); 
   } 
 
   return result; 
 }; 
 
 /** -------------------- UTILITIES -------------------- */ 
 
 export const formatTimeLabel = (hhmm: string): string => { 
   const [hStr, mStr] = hhmm.split(':'); 
   let h = parseInt(hStr, 10); 
   const m = parseInt(mStr, 10); 
 
   const ap = h >= 12 ? 'PM' : 'AM'; 
   h = h % 12 || 12; 
 
   return `${h}:${m.toString().padStart(2, '0')} ${ap}`; 
 }; 
 
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
 
 export const getTodayKey = (): DayKey | null => { 
   const d = new Date().getDay(); 
   const map: Record<number, DayKey> = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI' };
   return map[d] || null;
 }; 
 
 /** Real-time check */ 
 export const isBothFreeNow = ( 
   mine: Record<string, ClassItem[] | undefined>, 
   friend: Record<string, ClassItem[] | undefined> 
 ): boolean => { 
   const day = getTodayKey(); 
   if (!day) return false; 
 
   const now = new Date(); 
   const mins = now.getHours() * 60 + now.getMinutes(); 
 
   const m = timetableToBusyByDay(mine)[day]; 
   const f = timetableToBusyByDay(friend)[day]; 
 
   const free = findFreeSlots(m, f, 0, 24 * 60, 1); 
 
   return free.some(s => mins >= s.start && mins < s.end); 
 }; 
 
 /** Best slot suggestion */ 
 export const suggestBestSlot = ( 
   freeByDay: Record<DayKey, Slot[]> 
 ): { day: DayKey; slot: Slot } | null => { 
   let best: any = null; 
 
   for (const day of WEEKDAYS) { 
     for (const s of freeByDay[day]) { 
       const len = 
         parseTimeToMinutes(s.end) - parseTimeToMinutes(s.start); 
 
       if (!best || len > best.len) { 
         best = { day, slot: s, len }; 
       } 
     } 
   } 
 
   return best ? { day: best.day, slot: best.slot } : null; 
 }; 
