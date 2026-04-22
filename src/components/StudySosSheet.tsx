import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { createSOSAlert, ClassItem } from '../utils/firebase/firestore';

interface StudySosSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userTimetable: Record<string, ClassItem[]>;
}

export function StudySosSheet({ open, onOpenChange, userTimetable }: StudySosSheetProps) {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const courses = Array.from(
    new Set(
      Object.values(userTimetable)
        .flat()
        .map((item) => item.courseCode)
    )
  ).sort();

  const handleCreateSOS = async () => {
    if (!selectedCourse || !topic.trim()) {
      toast.error('Select a course and enter a topic');
      return;
    }

    setIsLoading(true);
    try {
      await createSOSAlert(selectedCourse, topic);
      toast.success('Study help request sent! (2 hour expiry)');
      setSelectedCourse('');
      setTopic('');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to create SOS alert');
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
            <DrawerTitle className="text-base font-semibold">Need study help?</DrawerTitle>
            <p className="text-xs text-gray-500 mt-2">Expires in 2 hours</p>
          </DrawerHeader>

          <div className="space-y-4">
            {/* Course Selector */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Course</label>
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="rounded-lg border-gray-200">
                  <SelectValue placeholder="Select a course..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.length > 0 ? (
                    courses.map((course) => (
                      <SelectItem key={course} value={course}>
                        {course}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No courses in timetable
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Topic Input */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Topic (max 80 chars)</label>
              <Input
                placeholder="E.g., Need help with loops"
                value={topic}
                onChange={(e) => setTopic(e.target.value.slice(0, 80))}
                className="rounded-lg border-gray-200 focus:ring-sky-500"
              />
              <p className="text-xs text-gray-400 mt-1">{topic.length}/80</p>
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
                onClick={handleCreateSOS}
                disabled={isLoading || !selectedCourse || !topic.trim()}
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white"
              >
                {isLoading ? 'Sending...' : 'Send SOS'}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
