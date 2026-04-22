import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';
import { toast } from 'sonner';
import { createPulse } from '../utils/firebase/firestore';

interface PulseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PulseSheet({ open, onOpenChange }: PulseSheetProps) {
  const [pulseText, setPulseText] = useState('');
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreatePulse = async () => {
    if (!pulseText.trim()) {
      toast.error('Tell us what you\'re doing!');
      return;
    }

    setIsLoading(true);
    try {
      await createPulse(pulseText, duration);
      toast.success(`You're pulsing for ${duration} minutes`);
      setPulseText('');
      setDuration(30);
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to create pulse');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="w-full px-4 py-6 space-y-6">
          <DrawerHeader className="px-0">
            <DrawerTitle className="text-base font-semibold">What are you doing?</DrawerTitle>
          </DrawerHeader>

          <div className="space-y-4">
            {/* Text Input */}
            <div>
              <Input
                placeholder="E.g., Grabbing coffee at the cafe"
                value={pulseText}
                onChange={(e) => setPulseText(e.target.value)}
                maxLength={80}
                className="rounded-lg border-gray-200 focus:ring-sky-500"
              />
              <p className="text-xs text-gray-400 mt-1">{pulseText.length}/80</p>
            </div>

            {/* Duration Picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">How long?</label>
              <div className="flex gap-2">
                {[15, 30, 60].map((mins) => (
                  <Button
                    key={mins}
                    variant={duration === mins ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDuration(mins as 15 | 30 | 60)}
                    className={`flex-1 ${
                      duration === mins
                        ? 'bg-sky-500 text-white border-sky-500'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {mins}m
                  </Button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreatePulse}
                disabled={isLoading || !pulseText.trim()}
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white"
              >
                {isLoading ? 'Creating...' : '+ Pulse'}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
