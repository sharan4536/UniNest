import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { isFirebaseConfigured, auth } from '../utils/firebase/client';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../utils/firebase/client';

interface PrivacySettings {
  ghostMode: boolean;
  locationVisible: boolean;
  onlineStatusVisible: boolean;
  discoverVisible: boolean;
  timetableVisible: boolean;
}

export function PrivacySettingsPage() {
  const [settings, setSettings] = useState<PrivacySettings>({
    ghostMode: localStorage.getItem('ghostMode') === 'on',
    locationVisible: localStorage.getItem('locationVisible') !== 'off',
    onlineStatusVisible: localStorage.getItem('onlineStatusVisible') !== 'off',
    discoverVisible: localStorage.getItem('discoverVisible') !== 'off',
    timetableVisible: localStorage.getItem('timetableVisible') !== 'off',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!isFirebaseConfigured || !auth.currentUser) return;

      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && snap.data().privacySettings) {
          const dbSettings = snap.data().privacySettings;
          setSettings((prev) => ({ ...prev, ...dbSettings }));
        }
      } catch (error) {
        console.error('Error loading privacy settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleToggle = async (key: keyof PrivacySettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    localStorage.setItem(key, newSettings[key] ? 'on' : 'off');

    // Save to Firestore
    if (isFirebaseConfigured && auth.currentUser) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          privacySettings: newSettings,
          updatedAt: new Date(),
        });
        toast.success('Settings updated');
      } catch (error) {
        console.error('Error saving privacy settings:', error);
        toast.error('Failed to update settings');
      }
    }
  };

  const settingsList = [
    {
      key: 'ghostMode' as const,
      title: 'Ghost Mode',
      description: 'Completely hidden from all features. No location, status, or activity visible.',
      isMain: true,
    },
    {
      key: 'locationVisible' as const,
      title: 'Location Visibility',
      description: 'Friends can see your location on the map. Does not affect Ghost Mode.',
    },
    {
      key: 'onlineStatusVisible' as const,
      title: 'Online Status',
      description: 'Show when you\'re active in the app and your last seen time.',
    },
    {
      key: 'discoverVisible' as const,
      title: 'Show in Discover',
      description: 'Appear in buddy matching and event suggestions for other users.',
    },
    {
      key: 'timetableVisible' as const,
      title: 'Timetable Visibility',
      description: 'Friends can see your class schedule and "You\'re Free" indicators.',
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-4 py-4 border-b border-gray-100 z-10">
        <h1 className="text-xl font-semibold text-gray-900">Privacy & Visibility</h1>
        <p className="text-sm text-gray-500 mt-1">Control how you appear in UniNest</p>
      </div>

      <div className="px-4 space-y-3">
        {settingsList.map((item) => (
          <Card
            key={item.key}
            className={`${
              item.isMain
                ? 'border-sky-200 bg-sky-50/50'
                : 'border-gray-100 bg-white'
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className={`${item.isMain ? 'font-bold' : 'font-semibold'} text-sm text-gray-900`}>
                    {item.title}
                  </h3>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
                <Switch
                  checked={settings[item.key]}
                  onCheckedChange={() => handleToggle(item.key)}
                  disabled={loading}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Explanation */}
      <div className="mx-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
        <p className="text-xs text-gray-600 leading-relaxed">
          <strong>Ghost Mode</strong> is the ultimate privacy toggle. When on, you won't appear
          anywhere in the app – not on the map, in buddy matching, event feeds, or any other feature.
          All other settings are ignored. Turn off Ghost Mode to respect individual privacy toggles.
        </p>
      </div>
    </div>
  );
}
