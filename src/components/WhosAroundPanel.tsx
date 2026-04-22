import React, { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { CheckIn, getCheckIns, getProfile, UserProfile } from '../utils/firebase/firestore';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';

interface WhosAroundPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhosAroundPanel({ open, onOpenChange }: WhosAroundPanelProps) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    const unsub = getCheckIns(async (checkins) => {
      setCheckIns(checkins);

      const profileMap: Record<string, UserProfile> = {};
      for (const checkin of checkins) {
        if (!profileMap[checkin.createdBy]) {
          const p = await getProfile(checkin.createdBy);
          if (p) profileMap[checkin.createdBy] = p;
        }
      }
      setProfiles(profileMap);
      setLoading(false);
    });

    return () => unsub();
  }, [open]);

  const getTimeAgo = (timestamp: any) => {
    const now = new Date();
    const created = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="w-full px-4 py-6">
          <DrawerHeader className="px-0 mb-4">
            <DrawerTitle className="text-base font-semibold">Who's around?</DrawerTitle>
            <p className="text-xs text-gray-500 mt-2">
              {checkIns.length > 0
                ? `${checkIns.length} checked in`
                : 'No one nearby right now'}
            </p>
          </DrawerHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-pulse text-gray-400">Loading...</div>
            </div>
          ) : checkIns.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {checkIns.map((checkin) => {
                const profile = profiles[checkin.createdBy];
                return (
                  <div
                    key={checkin.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Avatar className="w-10 h-10">
                      <img src={profile?.photoURL} alt={profile?.displayName} />
                      <AvatarFallback>{profile?.displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {profile?.displayName || 'Someone'}
                      </p>
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {checkin.location}
                        {checkin.note && ` · ${checkin.note}`}
                      </p>
                    </div>

                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {getTimeAgo(checkin.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-gray-500">No one is checked in nearby</p>
              <p className="text-xs text-gray-400 mt-1">Check back soon</p>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
