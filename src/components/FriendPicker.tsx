import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { UserProfile, getFriends } from '../utils/firebase/firestore';

interface FriendPickerProps {
  onSelect: (friendId: string) => void;
  selectedId?: string;
  onClose: () => void;
}

export function FriendPicker({ onSelect, selectedId, onClose }: FriendPickerProps) {
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = getFriends((friendsList) => {
      setFriends(friendsList);
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const filteredFriends = friends.filter((friend) =>
    friend.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search friends..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="rounded-lg border-gray-200"
      />

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="text-sm text-gray-500">Loading friends...</div>
        </div>
      ) : filteredFriends.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {filteredFriends.map((friend) => (
            <button
              key={friend.uid}
              onClick={() => {
                onSelect(friend.uid);
                onClose();
              }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                selectedId === friend.uid
                  ? 'bg-sky-50 border border-sky-200'
                  : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Avatar className="w-8 h-8">
                <img src={friend.photoURL} alt={friend.displayName} />
                <AvatarFallback>{friend.displayName?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <div className="text-left flex-1">
                <p className="text-sm font-medium text-gray-800">{friend.displayName}</p>
                <p className="text-xs text-gray-500">{friend.major || 'Campus'}</p>
              </div>
              {selectedId === friend.uid && (
                <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">No friends found</p>
        </div>
      )}
    </div>
  );
}
