/**
 * TimetableWidget — a compact, widget-style view of today's classes.
 *
 * Renders in three sizes controlled by the `?size=small|medium|large` URL
 * param so it can be embedded as an iframe in any widget host, saved as a
 * PWA home-screen shortcut, or screenshotted for a native iOS/Android widget.
 *
 * Expects the user's Firebase session to exist in the browser. If the user
 * hasn't signed in yet, a friendly prompt is shown.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { auth, isFirebaseConfigured } from '../utils/firebase/client';
import { loadTimetable, type ClassItem } from '../utils/firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Clock, MapPin, BookOpen } from 'lucide-react';

type Size = 'small' | 'medium' | 'large';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseTimeToMinutes(t?: string): number {
  if (!t) return 24 * 60;
  const s = t.trim().toUpperCase();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return 24 * 60;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3];
  if (ampm === 'AM' && h === 12) h = 0;
  else if (ampm === 'PM' && h !== 12) h += 12;
  return h * 60 + min;
}

function fmtTime(m: number): string {
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function getSize(): Size {
  const param = new URLSearchParams(window.location.search).get('size');
  if (param === 'small' || param === 'medium' || param === 'large') return param;
  return 'medium';
}

export function TimetableWidget() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [timetable, setTimetable] = useState<Record<string, ClassItem[]>>({});
  const [now, setNow] = useState<Date>(new Date());
  const [loading, setLoading] = useState<boolean>(true);
  const size = useMemo<Size>(() => getSize(), []);

  // Auth watcher
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Load timetable once signed in
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const tt = await loadTimetable();
        setTimetable(tt);
      } catch {
        setTimetable({});
      } finally {
        setLoading(false);
      }
    })();
  }, [authReady, user]);

  // Keep "now" fresh every 30s
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const todayName = DAY_NAMES[now.getDay()];
  const todaysClasses = useMemo(() => {
    const list = [...(timetable[todayName] || [])];
    list.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
    return list;
  }, [timetable, todayName]);

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const { ongoing, next } = useMemo(() => {
    let ongoing: ClassItem | null = null;
    let next: ClassItem | null = null;
    for (const c of todaysClasses) {
      const start = parseTimeToMinutes(c.time);
      const end = start + Math.round((Number(c.duration) || 1) * 60);
      if (minutesNow >= start && minutesNow < end) ongoing = c;
      else if (start > minutesNow && !next) next = c;
    }
    return { ongoing, next };
  }, [todaysClasses, minutesNow]);

  // ---- Layout ------------------------------------------------------------

  const widthByLayout: Record<Size, string> = {
    small: 'w-[170px] h-[170px]',
    medium: 'w-[340px] h-[170px]',
    large: 'w-[340px] h-[380px]',
  };

  const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
      className="flex min-h-screen items-center justify-center bg-transparent p-3"
      data-testid="widget-root"
    >
      <div
        className={`relative overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 text-white shadow-2xl ${widthByLayout[size]}`}
        data-testid="widget-card"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative h-full w-full p-4">{children}</div>
      </div>
    </div>
  );

  // Loading / auth states
  if (!authReady || loading) {
    return (
      <Container>
        <div className="flex h-full w-full items-center justify-center text-sm font-medium opacity-90">
          Loading…
        </div>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container>
        <div className="flex h-full w-full flex-col items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">UniNest</div>
            <div className="mt-1 text-lg font-extrabold leading-tight">Sign in to view your timetable</div>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-sm"
            data-testid="widget-signin-link"
          >
            Open UniNest →
          </a>
        </div>
      </Container>
    );
  }

  // --- SMALL: only Now + Next headline ---
  if (size === 'small') {
    const headline = ongoing || next;
    return (
      <Container>
        <div className="flex h-full w-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
              {ongoing ? 'Now' : next ? 'Next' : todayName}
            </div>
            <div className="text-[10px] font-semibold opacity-80">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          {headline ? (
            <div>
              <div className="text-base font-extrabold leading-tight line-clamp-2" data-testid="widget-small-course">
                {headline.course || headline.title}
              </div>
              <div className="mt-1 text-[10px] opacity-90">
                {fmtTime(parseTimeToMinutes(headline.time))}
              </div>
              {headline.location && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] opacity-85">
                  <MapPin className="h-3 w-3" /> {headline.location}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs font-semibold opacity-90">No classes today</div>
          )}
        </div>
      </Container>
    );
  }

  // --- MEDIUM: Now card + mini preview of next ---
  if (size === 'medium') {
    return (
      <Container>
        <div className="flex h-full w-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-85">
              UniNest · {todayName}
            </div>
            <div className="text-[10px] font-semibold opacity-85">
              {todaysClasses.length} session{todaysClasses.length === 1 ? '' : 's'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Now tile */}
            <div className="rounded-2xl bg-white/15 p-2.5 backdrop-blur-sm" data-testid="widget-medium-now">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest opacity-80">
                <span className={`h-1.5 w-1.5 rounded-full ${ongoing ? 'bg-white animate-pulse' : 'bg-white/40'}`} />
                Now
              </div>
              {ongoing ? (
                <>
                  <div className="mt-1 text-sm font-extrabold leading-tight line-clamp-2">
                    {ongoing.course || ongoing.title}
                  </div>
                  <div className="mt-1 text-[10px] opacity-90">{fmtTime(parseTimeToMinutes(ongoing.time))}</div>
                </>
              ) : (
                <div className="mt-1 text-xs font-semibold opacity-85">On break</div>
              )}
            </div>
            {/* Next tile */}
            <div className="rounded-2xl bg-white/15 p-2.5 backdrop-blur-sm" data-testid="widget-medium-next">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest opacity-80">
                <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                Next
              </div>
              {next ? (
                <>
                  <div className="mt-1 text-sm font-extrabold leading-tight line-clamp-2">
                    {next.course || next.title}
                  </div>
                  <div className="mt-1 text-[10px] opacity-90">{fmtTime(parseTimeToMinutes(next.time))}</div>
                </>
              ) : (
                <div className="mt-1 text-xs font-semibold opacity-85">
                  {ongoing ? 'Last class' : 'Done for today'}
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>
    );
  }

  // --- LARGE: full list of today ---
  return (
    <Container>
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-85">UniNest</div>
            <div className="text-lg font-extrabold leading-tight">{todayName}</div>
          </div>
          <div className="text-xs font-semibold opacity-85">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1" data-testid="widget-large-list">
          {todaysClasses.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <BookOpen className="mb-2 h-6 w-6 opacity-70" />
              <div className="text-sm font-semibold opacity-90">No classes today.</div>
              <div className="text-[10px] opacity-75">Enjoy the day off.</div>
            </div>
          )}
          {todaysClasses.map((cls) => {
            const start = parseTimeToMinutes(cls.time);
            const end = start + Math.round((Number(cls.duration) || 1) * 60);
            const isOngoing = ongoing && ongoing.id === cls.id;
            const isNext = next && next.id === cls.id;
            return (
              <div
                key={cls.id}
                className={`rounded-xl px-3 py-2 text-xs backdrop-blur-sm transition ${
                  isOngoing
                    ? 'bg-white text-sky-900 shadow-md'
                    : isNext
                      ? 'bg-white/30'
                      : 'bg-white/10'
                }`}
                data-testid={`widget-row-${cls.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-extrabold leading-tight">
                      {cls.course || cls.title}
                    </div>
                    {cls.location && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] opacity-80">
                        <MapPin className="h-2.5 w-2.5" /> {cls.location}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[10px] opacity-90">
                    <div className="inline-flex items-center gap-1 font-semibold">
                      <Clock className="h-2.5 w-2.5" /> {fmtTime(start)}
                    </div>
                    <div className="opacity-70">{fmtTime(end)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Container>
  );
}
