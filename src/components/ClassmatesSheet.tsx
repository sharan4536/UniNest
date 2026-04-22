import React, { useState } from 'react';
import { MessageCircle, UserCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { createConversation, type ClassItem } from '../utils/firebase/firestore';
import type { ClassmateCandidate } from '../utils/classmates';
import { toast } from 'sonner';

interface ClassmatesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classmates: ClassmateCandidate[];
  cls: ClassItem;
  onMessaged?: () => void;
}

export function ClassmatesSheet({ open, onOpenChange, classmates, cls, onMessaged }: ClassmatesSheetProps) {
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [messagingUid, setMessagingUid] = useState<string | null>(null);

  const handleMessage = async (uid: string) => {
    try {
      setMessagingUid(uid);
      await createConversation(uid);
      toast.success('Conversation opened', { description: 'Check the Messages tab to continue the chat.' });
      onOpenChange(false);
      if (onMessaged) onMessaged();
    } catch (e: any) {
      toast.error('Could not start chat', { description: e?.message || 'Please try again.' });
    } finally {
      setMessagingUid(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl bg-sky-50/95 ring-1 ring-sky-400/10 backdrop-blur-xl max-h-[85vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-sky-400/10 bg-white/60 backdrop-blur-md">
          <DialogTitle className="ui-h3">
            Friends in this class
          </DialogTitle>
          <p className="ui-caption mt-0.5">
            {(cls as any).course || cls.title} · {cls.time}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {classmates.length === 0 ? (
            <p className="ui-body text-center py-8 text-slate-400">No friends in this class yet.</p>
          ) : (
            classmates.map((m) => {
              const isExpanded = expandedUid === m.uid;
              const isBusy = messagingUid === m.uid;
              return (
                <div
                  key={m.uid}
                  data-testid={`classmate-card-${m.uid}`}
                  className="rounded-2xl bg-white/80 ring-1 ring-sky-400/10 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 ring-2 ring-sky-400/20">
                      <AvatarImage src={m.photoURL} alt={m.name} className="object-cover" />
                      <AvatarFallback className="bg-sky-100 text-sky-700 font-bold">
                        {m.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="ui-body-strong truncate">{m.name}</p>
                      <p className="ui-caption truncate">
                        {m.major || 'Student'}{m.year ? ` · ${m.year}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setExpandedUid(isExpanded ? null : m.uid)}
                      className="h-9 flex-1 rounded-xl bg-white text-sky-700 ring-1 ring-sky-400/15 text-[13px] font-bold hover:bg-sky-50"
                      data-testid={`classmate-view-${m.uid}`}
                    >
                      <UserCircle2 className="mr-1.5 h-4 w-4" />
                      {isExpanded ? 'Hide profile' : 'View profile'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => handleMessage(m.uid)}
                      className="h-9 flex-1 rounded-xl bg-sky-400 hover:bg-sky-500 text-white text-[13px] font-bold shadow-[0_4px_6px_-4px_rgba(56,189,248,0.3)]"
                      data-testid={`classmate-message-${m.uid}`}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      {isBusy ? 'Opening...' : 'Message'}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 rounded-xl bg-sky-50/70 ring-1 ring-sky-400/10 p-3 space-y-1.5">
                      <div>
                        <span className="ui-label block">Name</span>
                        <span className="ui-body">{m.name}</span>
                      </div>
                      {m.major && (
                        <div>
                          <span className="ui-label block">Program</span>
                          <span className="ui-body">{m.major}</span>
                        </div>
                      )}
                      {m.year && (
                        <div>
                          <span className="ui-label block">Year</span>
                          <span className="ui-body">{m.year}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t border-sky-400/10 bg-white/60 backdrop-blur-md">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full h-10 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white text-[13px] font-bold"
            data-testid="classmates-close-btn"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
