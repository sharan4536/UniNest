import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { parseTimetable, type ParsedClass } from '../utils/timetableParser';
import { saveTimetable as saveUserTimetable, loadTimetable as loadUserTimetable, type ClassItem } from '../utils/firebase/firestore';

const timeSlots = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'
];

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

type NewClass = Omit<ClassItem, 'id'> & { day: string };

type ReviewItem = {
  id: number;
  name: string;
  school: string;
  course?: string;
  review: string;
};

// Mock timetable removed - starting with empty timetable for new users

export function TimetablePage({ currentUser }: { currentUser?: unknown }) {
  const [timetable, setTimetable] = useState<Record<string, ClassItem[]>>({});
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [importText, setImportText] = useState<string>('');
  const [imported, setImported] = useState<ParsedClass[]>([]);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [lastImportIds, setLastImportIds] = useState<Array<{ day: string; id: number }>>([]);
  const [newClass, setNewClass] = useState<NewClass>({
    course: '',
    title: '',
    time: '9:00 AM',
    duration: 1,
    location: '',
    academicBlock: '',
    day: 'Monday'
  });

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [facultyForm, setFacultyForm] = useState<{ name: string; school: string; course: string; review: string }>({
    name: '',
    school: '',
    course: '',
    review: ''
  });
  const [activeTab, setActiveTab] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadTimetable();
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px)');
    const applyView = () => setActiveTab(mql.matches ? 'list' : 'grid');
    applyView();
    mql.addEventListener('change', applyView);
    return () => mql.removeEventListener('change', applyView);
  }, []);

  const loadTimetable = async () => {
    setLoading(true);
    try {
      const savedTimetable = await loadUserTimetable();
      setTimetable(savedTimetable);
    } catch (error) {
      console.error('Error loading timetable:', error);
      setTimetable({});
    } finally {
      setLoading(false);
    }
  };

  const isDoubleSlot = (start: string, end: string): boolean => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60;
    return minutes >= 100; // treat >= 1h40m as double slot
  };

  const saveTimetable = async (updatedTimetable: Record<string, ClassItem[]>) => {
    try {
      await saveUserTimetable(updatedTimetable);
    } catch (error) {
      console.error('Error saving timetable:', error);
    }
  };

  const handleAddClass = async () => {
    const classWithId = {
      ...newClass,
      id: Date.now(),
      duration: Number(newClass.duration)
    };
    
    const updatedTimetable = {
      ...timetable,
      [newClass.day]: [...(timetable[newClass.day] || []), classWithId]
    };
    
    setTimetable(updatedTimetable);
    await saveTimetable(updatedTimetable);
    
    setNewClass({
      course: '',
      title: '',
      time: '9:00 AM',
      duration: 1,
      location: '',
      academicBlock: '',
      day: 'Monday'
    });
    setIsDialogOpen(false);
  };

  const handleDeleteClass = async (day: string, classId: number) => {
    const updatedTimetable = {
      ...timetable,
      [day]: (timetable[day] as ClassItem[]).filter((c: ClassItem) => c.id !== classId)
    };
    
    setTimetable(updatedTimetable);
    await saveTimetable(updatedTimetable);
  };

  const getTimeSlotIndex = (time: string): number => {
    return timeSlots.indexOf(time);
  };

  const getClassColor = (course: string): string => {
    const colors: Record<string, string> = {
      'CS 301': 'bg-blue-100 border-blue-300',
      'MATH 220': 'bg-green-100 border-green-300',
      'PHYS 201': 'bg-yellow-100 border-yellow-300',
      'ENG 101': 'bg-purple-100 border-purple-300',
      'Study Group': 'bg-pink-100 border-pink-300'
    };
    return colors[course] || 'bg-gray-100 border-gray-300';
  };

  // Helpers for importing parsed classes into the timetable structure
  const mapDayAbbrevToFull = (abbr: string): string => {
    const m: Record<string, string> = {
      MON: 'Monday',
      TUE: 'Tuesday',
      WED: 'Wednesday',
      THU: 'Thursday',
      FRI: 'Friday',
      SAT: 'Saturday',
      SUN: 'Sunday',
    };
    return m[abbr.toUpperCase()] || abbr;
  };

  const to12h = (time: string): string => {
    // expects HH:MM, returns h:MM AM/PM
    const [hhStr, mm] = time.split(':');
    let hh = parseInt(hhStr, 10);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${mm} ${ampm}`;
  };

  const mapRoomToBlock = (location?: string): string | undefined => {
    if (!location) return undefined;
    const lib = location.toLowerCase();
    if (lib.includes('library')) return 'Library';
    const m = location.match(/^([A-Za-z]+)/);
    return m ? m[1].toUpperCase() : undefined;
  };

  const durationHours = (start: string, end: string): number => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60; // wrap around safety
    // Round to nearest 0.5 hour
    const hours = minutes / 60;
    return Math.max(0.5, Math.round(hours * 2) / 2);
  };

  const saveParsedClasses = async (parsed: ParsedClass[]) => {
    if (!parsed.length) return;
    const updated: Record<string, ClassItem[]> = { ...timetable };
    const added: Array<{ day: string; id: number }> = [];
    parsed.forEach((it: ParsedClass) => {
      const dayFull = mapDayAbbrevToFull(it.day);
      const timeLabel = /[AP]M$/i.test(it.startTime) ? it.startTime : to12h(it.startTime);
      const dur = durationHours(it.startTime, it.endTime);
      const entry: ClassItem = {
        id: Date.now() + Math.floor(Math.random() * 100000),
        course: it.courseCode,
        title: it.classType,
        time: timeLabel,
        duration: dur,
        location: it.location || '',
        academicBlock: mapRoomToBlock(it.location),
      } as ClassItem;
      const existing = updated[dayFull] || [];
      const isDup = existing.some((c) => c.course === entry.course && c.time === entry.time && c.location === entry.location);
      if (isDup) {
        updated[dayFull] = existing;
      } else {
        updated[dayFull] = [...existing, entry];
        added.push({ day: dayFull, id: entry.id });
      }
    });
    setTimetable(updated);
    await saveTimetable(updated);
    setLastImportIds(added);
    setIsImportOpen(false);
  };

  const handleSaveImported = async () => {
    await saveParsedClasses(imported);
  };

  const handleUndoLastImport = async () => {
    if (!lastImportIds.length) return;
    const updated: Record<string, ClassItem[]> = { ...timetable };
    lastImportIds.forEach(({ day, id }) => {
      if (updated[day]) {
        updated[day] = updated[day].filter((c) => c.id !== id);
      }
    });
    setTimetable(updated);
    await saveTimetable(updated);
    setLastImportIds([]);
  };

  const handleEmptySlotClick = (day: string, time: string) => {
    setNewClass({
      ...newClass,
      day: day,
      time: time
    });
    setIsDialogOpen(true);
  };

  const TimetableGrid: React.FC = () => (
    <div className="overflow-x-auto">
      <div className="min-w-full grid grid-cols-6 gap-1 sm:gap-2">
        {/* Header */}
        <div></div>
        {days.map(day => (
          <div key={day} className="text-center font-medium p-1 sm:p-2 text-[11px] sm:text-sm rounded-lg" style={{ backgroundColor: '#C6ECFF' }}>
            {day}
          </div>
        ))}
        
        {/* Time slots and classes */}
        {timeSlots.map((time, timeIndex) => (
          <React.Fragment key={time}>
            <div className="text-[11px] sm:text-sm p-1 sm:p-2 text-right opacity-75 font-medium">
              {time}
            </div>
            {days.map((day: string) => {
              const classesAtTime = (timetable[day] as ClassItem[] | undefined)?.filter((cls: ClassItem) => cls.time === time) || [];
              const hasClasses = classesAtTime.length > 0;
              
              return (
                <div 
                  key={`${day}-${time}`} 
                  className={`relative min-h-10 sm:min-h-12 border border-gray-200 rounded ${
                    !hasClasses ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors' : ''
                  }`}
                  onClick={!hasClasses ? () => handleEmptySlotClick(day, time) : undefined}
                >
                  {!hasClasses && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] sm:text-xs opacity-0 hover:opacity-100 transition-opacity">
                      + Add Class
                    </div>
                  )}
                  {classesAtTime.map((cls: ClassItem) => (
                    <div
                      key={cls.id}
                      className={`absolute inset-1 p-1 sm:p-2 rounded overflow-hidden border-l-4 cursor-pointer hover:shadow-md transition-shadow ${getClassColor(cls.course)}`}
                      style={{ 
                        height: `${cls.duration * 48 - 4}px`,
                        zIndex: 1
                      }}
                      onClick={() => setSelectedClass(cls)}
                    >
                      <div className="text-[9px] sm:text-xs font-medium break-words leading-tight">{cls.course}</div>
                      <div className="text-[9px] sm:text-xs opacity-75 whitespace-normal break-words leading-tight">{cls.title}</div>
                      <div className="text-[9px] sm:text-xs opacity-60 whitespace-normal break-words leading-tight">{cls.location}</div>
                      {isEditing && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute top-1 right-1 w-4 h-4 p-0 text-xs"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDeleteClass(day, cls.id);
                          }}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  const ClassList: React.FC = () => (
    <div className="space-y-4">
      {days.map((day: string) => (
        <Card key={day}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{day}</CardTitle>
          </CardHeader>
          <CardContent>
            {((timetable[day]?.length ?? 0) > 0) ? (
              <div className="space-y-2">
                {timetable[day]!.map((cls: ClassItem) => (
                  <div 
                    key={cls.id}
                    className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${getClassColor(cls.course)}`}
                    onClick={() => setSelectedClass(cls)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{cls.course} - {cls.title}</div>
                        <div className="text-sm opacity-75">{cls.time} • {cls.location}</div>
                        <div className="text-sm opacity-60">{cls.academicBlock || cls.professor}</div>
                      </div>
                      {isEditing && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDeleteClass(day, cls.id);
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm opacity-75">No classes scheduled</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl mb-2">My Timetable</h1>
          <p className="opacity-75">Manage your class schedule and study sessions</p>
        </div>
        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2">
          <Button className="w-full sm:w-auto" onClick={() => setIsEditing(!isEditing)} variant={isEditing ? 'destructive' : 'outline'}>
            {isEditing ? 'Done Editing' : 'Edit Schedule'}
          </Button>
          {/* Add Class Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto" style={{ backgroundColor: '#C6ECFF', color: '#000' }}>Add Class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Class</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="course">Course Code</Label>
                    <Input id="course" placeholder="CS 301" value={newClass.course} onChange={(e) => setNewClass({ ...newClass, course: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Course Title</Label>
                    <Input id="title" placeholder="Data Structures" value={newClass.title} onChange={(e) => setNewClass({ ...newClass, title: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="day">Day</Label>
                    <select id="day" className="w-full p-2 border border-gray-300 rounded" value={newClass.day} onChange={(e) => setNewClass({ ...newClass, day: e.target.value })}>
                      {days.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Time</Label>
                    <select id="time" className="w-full p-2 border border-gray-300 rounded" value={newClass.time} onChange={(e) => setNewClass({ ...newClass, time: e.target.value })}>
                      {timeSlots.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (hours)</Label>
                    <Input id="duration" type="number" step="0.5" min="0.5" max="4" value={newClass.duration} onChange={(e) => setNewClass({ ...newClass, duration: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" placeholder="Room 101" value={newClass.location} onChange={(e) => setNewClass({ ...newClass, location: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="academicBlock">Academic Block</Label>
                    <Input id="academicBlock" placeholder="Block A / Main Block / Lab Wing" value={newClass.academicBlock} onChange={(e) => setNewClass({ ...newClass, academicBlock: e.target.value })} />
                  </div>
                </div>
                <Button onClick={handleAddClass} className="w-full" style={{ backgroundColor: '#C6ECFF', color: '#000' }}>Add Class</Button>
              </div>
            </DialogContent>
          </Dialog>
          {/* Import Timetable Dialog */}
          <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto" variant="outline">Import Timetable</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl sm:max-w-2xl p-4 max-h-[85vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Import Timetable</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <label className="text-xs font-medium">Paste your raw timetable text</label>
                <textarea className="w-full min-h-[140px] p-2 border rounded-md font-mono text-xs" placeholder="Paste your full timetable text here..." value={importText} onChange={(e) => setImportText(e.target.value)} />
                <div className="flex items-center gap-2">
                  <Button size="sm" style={{ backgroundColor: '#C6ECFF', color: '#000' }} onClick={() => {
                    try {
                      const results = parseTimetable(importText);
                      setImported(results);
                    } catch (err) {
                      console.error('Import failed', err);
                    }
                  }}>Import Schedule</Button>
                  <span className="text-xs opacity-70">{imported.length} classes found</span>
                </div>
                {imported.length > 0 && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs opacity-70">{imported.length} classes parsed</span>
                    <Button size="sm" onClick={handleSaveImported} disabled={imported.length === 0}>
                      Save To Timetable
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'grid' | 'list')} className="space-y-4">
        <TabsList>
          <TabsTrigger value="grid">Grid View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>
        <TabsContent value="grid">
          <Card>
            <CardContent className="p-4 max-h-[70vh] overflow-auto">
              <TimetableGrid />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="list">
          <div className="max-h-[70vh] overflow-auto">
            <ClassList />
          </div>
        </TabsContent>
      </Tabs>

      {/* Class Details Dialog */}
      {selectedClass && (
        <Dialog open={!!selectedClass} onOpenChange={() => setSelectedClass(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedClass.course} - {selectedClass.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Time</Label>
                  <p>{selectedClass.time}</p>
                </div>
                <div>
                  <Label>Duration</Label>
                  <p>{selectedClass.duration} hour(s)</p>
                </div>
                <div>
                  <Label>Location</Label>
                  <p>{selectedClass.location}</p>
                </div>
                <div>
                  <Label>Academic Block</Label>
                  <p>{selectedClass.academicBlock || selectedClass.professor}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedClass(null)}>Close</Button>
                <Button style={{ backgroundColor: '#C6ECFF', color: '#000' }}>Study with Friends</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Weekly Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#C6ECFF' }}>
              <div className="text-xl mb-1">{(Object.values(timetable).flat() as ClassItem[]).length}</div>
              <div className="text-sm opacity-75">Total Classes</div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#C6ECFF' }}>
              <div className="text-xl mb-1">{(Object.values(timetable).flat() as ClassItem[]).reduce((sum, cls) => sum + cls.duration, 0)}</div>
              <div className="text-sm opacity-75">Hours/Week</div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#C6ECFF' }}>
              <div className="text-xl mb-1">{new Set((Object.values(timetable).flat() as ClassItem[]).map(cls => cls.course)).size}</div>
              <div className="text-sm opacity-75">Unique Courses</div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#C6ECFF' }}>
              <div className="text-xl mb-1">{Object.values(timetable).filter(day => (day as ClassItem[]).length > 0).length}</div>
              <div className="text-sm opacity-75">Active Days</div>
            </div>
          </div>
        </CardContent>
      </Card>

      
    </div>
  );
}
