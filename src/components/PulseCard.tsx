import React, { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Pulse, getProfile, UserProfile } from '../utils/firebase/firestore';

interface PulseCardProps {
  pulse: Pulse;
}

export function PulseCard({ pulse }: PulseCardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      if (pulse.createdBy) {
        const p = await getProfile(pulse.createdBy);
        setProfile(p);
      }
    };
    loadProfile();

    const updateTime = () => {
      const now = new Date();
      const created = pulse.createdAt?.toDate ? pulse.createdAt.toDate() : new Date(pulse.createdAt);
      const diffMs = now.getTime() - created.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) setTimeAgo('now');
      else if (diffMins < 60) setTimeAgo(`${diffMins}m ago`);
      else setTimeAgo(`${Math.floor(diffMins / 60)}h ago`);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [pulse]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white/50 border border-gray-100 rounded-full backdrop-blur-sm hover:bg-white/70 transition-colors duration-200">
      <Avatar className="w-8 h-8">
        <img src={profile?.photoURL} alt={profile?.displayName} />
        <AvatarFallback>{profile?.displayName?.charAt(0) || 'U'}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {profile?.displayName || 'Someone'}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {pulse.text}
        </p>
      </div>

      <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
        {timeAgo}
      </span>
    </div>
  );
}
