import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Drawer, DrawerContent } from './ui/drawer';
import { toast } from 'sonner';
import { createPulse } from '../utils/firebase/firestore';

interface PulseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Vibe = 'chill' | 'hype' | 'study' | 'social' | 'music';

const VIBES = [
  { id: 'chill', label: 'Chill', icon: 'energy_savings_leaf' },
  { id: 'hype', label: 'Hype', icon: 'bolt' },
  { id: 'study', label: 'Study', icon: 'menu_book' },
  { id: 'social', label: 'Social', icon: 'groups' },
  { id: 'music', label: 'Music', icon: 'music_note' },
] as const;

const CROWD_RANGES = [
  { min: 1, max: 10, label: 'Intimate' },
  { min: 10, max: 30, label: 'Standard' },
  { min: 30, max: 100, label: 'Massive' },
];

export function PulseSheet({ open, onOpenChange }: PulseSheetProps) {
  const [pulseText, setPulseText] = useState('');
  const [vibe, setVibe] = useState<Vibe>('hype');
  const [crowdMin, setCrowdMin] = useState(10);
  const [crowdMax, setCrowdMax] = useState(30);
  const [isPublic, setIsPublic] = useState(true);
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const handleCreatePulse = async () => {
    if (!pulseText.trim()) {
      toast.error('Tell us what you\'re doing!');
      return;
    }

    setIsLoading(true);
    try {
      const metadata = {
        vibe,
        crowdMin,
        crowdMax,
        isPublic,
      };
      await createPulse(pulseText, duration, metadata);
      toast.success(`Your ${vibe} pulse is live!`);
      setPulseText('');
      setVibe('hype');
      setCrowdMin(10);
      setCrowdMax(30);
      setIsPublic(true);
      setDuration(30);
      setCurrentStep(1);
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to create pulse');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const getVibeIcon = (vibeId: Vibe) => {
    return VIBES.find(v => v.id === vibeId)?.icon || 'bolt';
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] px-0 pb-0">
        <div className="flex flex-col h-full">
          {/* Drag Handle & Step Indicator */}
          <div className="flex flex-col items-center pt-4 pb-2 px-8">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-6"></div>
            <div className="w-full">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">STEP {currentStep} OF 3</span>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-outline">
                  {currentStep === 1 && 'WHAT & WHEN'}
                  {currentStep === 2 && 'VIBE & CROWD'}
                  {currentStep === 3 && 'CONFIRM'}
                </span>
              </div>
              <div className="h-1.5 w-full bg-gray-200 rounded-full flex gap-1 overflow-hidden">
                <div className={`h-full ${currentStep >= 1 ? 'bg-primary/30' : 'bg-gray-200'}`} style={{width: '33%'}}></div>
                <div className={`h-full ${currentStep >= 2 ? 'bg-primary' : 'bg-gray-200'}`} style={{width: '33%'}}></div>
                <div className={`h-full ${currentStep >= 3 ? 'bg-primary' : 'bg-gray-200'}`} style={{width: '33%'}}></div>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-8 pb-12 space-y-10">
            {currentStep === 1 && (
              <>
                <div className="space-y-1">
                  <h3 className="text-3xl font-extrabold tracking-tighter text-on-background">What are you doing?</h3>
                  <p className="text-outline text-sm leading-relaxed">Share what you're up to right now.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-extrabold tracking-widest uppercase text-on-surface-variant">ACTIVITY</label>
                  <Input
                    placeholder="E.g., Grabbing coffee at the cafe"
                    value={pulseText}
                    onChange={(e) => setPulseText(e.target.value.slice(0, 80))}
                    maxLength={80}
                    className="rounded-2xl border-surface-container focus:ring-primary h-12"
                  />
                  <p className="text-xs text-outline mt-1">{pulseText.length}/80</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-extrabold tracking-widest uppercase text-on-surface-variant">DURATION</label>
                  <div className="flex gap-3">
                    {[15, 30, 60].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setDuration(mins as 15 | 30 | 60)}
                        className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all ${
                          duration === mins
                            ? 'bg-primary text-white shadow-lg shadow-primary/25'
                            : 'bg-surface-container-lowest border border-surface-container text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="space-y-1">
                  <h3 className="text-3xl font-extrabold tracking-tighter text-on-background">What's the pulse?</h3>
                  <p className="text-outline text-sm leading-relaxed">Define the atmosphere so the right people find your nest.</p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-extrabold tracking-widest uppercase text-on-surface-variant">SELECT VIBE</h4>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {VIBES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVibe(v.id as Vibe)}
                        className={`flex-shrink-0 px-6 py-4 rounded-3xl flex flex-col items-center gap-2 transition-all ${
                          vibe === v.id
                            ? 'bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg shadow-primary/25'
                            : 'bg-surface-container-lowest border border-surface-container text-on-surface hover:bg-surface-container/50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xl">{v.icon}</span>
                        <span className="text-sm font-semibold">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <h4 className="text-xs font-extrabold tracking-widest uppercase text-on-surface-variant">CROWD CAPACITY</h4>
                    <span className="text-2xl font-black text-primary tracking-tighter">{crowdMin}-{crowdMax}</span>
                  </div>

                  <div className="space-y-6">
                    <div className="relative w-full h-12 flex items-center group">
                      <div className="absolute w-full h-2 bg-surface-container-high rounded-full"></div>
                      <div
                        className="absolute h-2 bg-primary rounded-full"
                        style={{
                          left: `${(crowdMin / 100) * 100}%`,
                          right: `${100 - (crowdMax / 100) * 100}%`,
                        }}
                      ></div>

                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={crowdMin}
                        onChange={(e) => {
                          const newMin = Math.min(Number(e.target.value), crowdMax);
                          setCrowdMin(newMin);
                        }}
                        className="absolute w-full h-2 top-5 appearance-none bg-transparent rounded-full cursor-pointer pointer-events-none z-5"
                        style={{
                          WebkitAppearance: 'slider-horizontal',
                          outline: 'none',
                        }}
                      />

                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={crowdMax}
                        onChange={(e) => {
                          const newMax = Math.max(Number(e.target.value), crowdMin);
                          setCrowdMax(newMax);
                        }}
                        className="absolute w-full h-2 top-5 appearance-none bg-transparent rounded-full cursor-pointer pointer-events-none z-6"
                        style={{
                          WebkitAppearance: 'slider-horizontal',
                          outline: 'none',
                        }}
                      />

                      <div
                        className="absolute w-8 h-8 bg-white border-4 border-primary rounded-full shadow-md z-10 cursor-grab active:cursor-grabbing pointer-events-auto"
                        style={{ left: `calc(${(crowdMin / 100) * 100}% - 16px)` }}
                      ></div>

                      <div
                        className="absolute w-8 h-8 bg-white border-4 border-primary rounded-full shadow-md z-10 cursor-grab active:cursor-grabbing pointer-events-auto"
                        style={{ left: `calc(${(crowdMax / 100) * 100}% - 16px)` }}
                      ></div>
                    </div>

                    <div className="flex justify-between text-[10px] font-bold text-outline uppercase tracking-widest">
                      <span>Intimate</span>
                      <span>Standard</span>
                      <span>Massive</span>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-low rounded-3xl p-5 flex items-center justify-between border border-primary/10">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-primary/20">
                      <span className="material-symbols-outlined text-primary">{isPublic ? 'lock_open' : 'lock'}</span>
                    </div>
                    <div>
                      <p className="font-bold text-on-background text-sm">{isPublic ? 'Public Pulse' : 'Private Pulse'}</p>
                      <p className="text-xs text-outline">{isPublic ? 'Visible to everyone in your nest' : 'Only visible to friends'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPublic(!isPublic)}
                    className={`w-14 h-8 rounded-full relative p-1 cursor-pointer transition-all ${
                      isPublic ? 'bg-primary shadow-inner' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow-md transition-all ${isPublic ? 'translate-x-6' : ''}`}></div>
                  </button>
                </div>
              </>
            )}

            {currentStep === 3 && (
              <>
                <div className="space-y-1">
                  <h3 className="text-3xl font-extrabold tracking-tighter text-on-background">Confirm your pulse</h3>
                  <p className="text-outline text-sm leading-relaxed">Let's go live!</p>
                </div>

                <div className="space-y-4">
                  <div className="bg-surface-container-low rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary">info</span>
                      <div>
                        <p className="text-sm font-semibold text-on-background">Activity</p>
                        <p className="text-sm text-outline">{pulseText}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary">schedule</span>
                      <div>
                        <p className="text-sm font-semibold text-on-background">Duration</p>
                        <p className="text-sm text-outline">{duration} minutes</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary">bolt</span>
                      <div>
                        <p className="text-sm font-semibold text-on-background">Vibe</p>
                        <p className="text-sm text-outline capitalize">{vibe}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary">people</span>
                      <div>
                        <p className="text-sm font-semibold text-on-background">Crowd</p>
                        <p className="text-sm text-outline">{crowdMin}-{crowdMax} people</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary">{isPublic ? 'lock_open' : 'lock'}</span>
                      <div>
                        <p className="text-sm font-semibold text-on-background">Visibility</p>
                        <p className="text-sm text-outline">{isPublic ? 'Public' : 'Private'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="px-8 pb-6 pt-4 border-t border-surface-container flex gap-4">
            <button
              onClick={() => {
                if (currentStep > 1) setCurrentStep(currentStep - 1);
                else onOpenChange(false);
              }}
              className="flex-1 py-4 rounded-3xl bg-surface-container-high text-on-surface font-bold text-sm tracking-tight transition-all active:scale-95"
            >
              {currentStep === 1 ? 'Cancel' : 'Back'}
            </button>
            <button
              onClick={() => {
                if (currentStep < 3) {
                  setCurrentStep(currentStep + 1);
                } else {
                  handleCreatePulse();
                }
              }}
              disabled={isLoading || (currentStep === 1 && !pulseText.trim())}
              className="flex-1 py-4 rounded-3xl bg-gradient-to-r from-primary to-primary/80 text-white font-bold text-sm tracking-tight shadow-lg shadow-primary/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : currentStep === 3 ? '+ Pulse' : 'Continue'}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
