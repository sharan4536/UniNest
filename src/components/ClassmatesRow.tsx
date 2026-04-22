import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import type { ClassItem } from '../utils/firebase/firestore';
import { findClassmates, type ClassmateCandidate } from '../utils/classmates';
import { ClassmatesSheet } from './ClassmatesSheet';

interface ClassmatesRowProps {
  cls: ClassItem;
  day: string;
  /** Optional: called when user taps "Message" inside the sheet after conversation is created */
  onMessaged?: () => void;
  className?: string;
}

/**
 * A compact "friends in this class" avatar strip. Shows up to 3 avatars
 * plus a "+N" chip. Tapping the row opens a bottom sheet with the full list.
 */
export function ClassmatesRow({ cls, day, onMessaged, className = '' }: ClassmatesRowProps) {
  const [mates, setMates] = useState<ClassmateCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    findClassmates({ day, myClass: cls })
      .then((list) => { if (alive) setMates(list); })
      .catch(() => { if (alive) setMates([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cls, day]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="classmates-loading">
        <div className="h-7 w-7 rounded-full bg-slate-200/70 animate-pulse" />
        <div className="h-3 w-24 rounded-full bg-slate-200/70 animate-pulse" />
      </div>
    );
  }

  if (mates.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 text-slate-400 ${className}`} data-testid="classmates-empty">
        <Users className="h-3.5 w-3.5" />
        <span className="ui-caption">No friends in this class yet</span>
      </div>
    );
  }

  const visible = mates.slice(0, 3);
  const extra = Math.max(0, mates.length - visible.length);

  return (
    <>
      <button
        type="button"
        data-testid={`classmates-row-${cls.id}`}
        onClick={(e) => { e.stopPropagation(); setSheetOpen(true); }}
        className={`flex items-center gap-2 rounded-full px-1 py-0.5 -mx-1 hover:bg-sky-50 transition ${className}`}
      >
        <div className="flex items-center">
          {visible.map((m, idx) => (
            <div
              key={m.uid}
              className="-ml-2 first:ml-0 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-sky-100 text-[10px] font-bold text-sky-700 overflow-hidden"
              style={{ zIndex: 10 + (visible.length - idx) }}
              title={m.name}
            >
              {m.photoURL ? (
                <img src={m.photoURL} alt={m.name} className="h-full w-full object-cover" />
              ) : (
                <span>{m.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
          ))}
          {extra > 0 && (
            <div className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-sky-400 text-[10px] font-bold text-white">
              +{extra}
            </div>
          )}
        </div>
        <span className="ui-caption text-sky-700 font-semibold">
          {mates.length === 1
            ? `${mates[0].name.split(' ')[0]} is here`
            : `${mates.length} friends in this class`}
        </span>
      </button>
      <ClassmatesSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        classmates={mates}
        cls={cls}
        onMessaged={onMessaged}
      />
    </>
  );
}
