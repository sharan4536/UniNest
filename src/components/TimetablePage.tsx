import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import { MoreVertical, Plus, Upload, Edit, FileText, Image as ImageIcon, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { extractTextFromPDF } from '../utils/pdfParser';
import { extractTextFromImage } from '../utils/imageParser';
import { parseTimetable, type ParsedClass } from '../utils/timetableParser';
import { saveTimetable as saveUserTimetable, loadTimetable as loadUserTimetable, type ClassItem, createSOSAlert } from '../utils/firebase/firestore';

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

export function TimetablePage({ currentUser }: { currentUser?: unknown }) {
  const [timetable, setTimetable] = useState<Record<string, ClassItem[]>>({});
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [sosCourse, setSosCourse] = useState("");
  const [sosTopic, setSosTopic] = useState("");
  const [loading, setLoading] = useState<boolean>(true);
  const [importText, setImportText] = useState<string>('');
  const [imported, setImported] = useState<ParsedClass[]>([]);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [lastImportIds, setLastImportIds] = useState<Array<{ day: string; id: number }>>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);
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

  const uploadTimetableFile = async (file: File) => {
    setIsParsingFile(true);
    const formData = new FormData();
    formData.append('timetable', file);

    try {
      // Replace with actual Backend URL when available
      toast.info("Uploading file...", { description: `Sending ${file.name} to API...` });

      const response = await fetch('https://your-api.com/parse-timetable', {
        method: 'POST',
        body: formData,
        // Browser sets Content-Type to multipart/form-data automatically including the boundary
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();

      // Adapt expected API format [{day, time, subject}] to our ParsedClass[]
      const results: ParsedClass[] = (data.classes || []).map((c: any) => ({
        day: c.day || 'MON',
        startTime: c.time ? c.time.split('-')[0]?.trim() : '09:00',
        endTime: c.time ? c.time.split('-')[1]?.trim() : '10:00',
        courseCode: c.subject_name || c.subject || 'UNKNOWN',
        classType: 'Theory',
        location: ''
      }));

      if (results.length > 0) {
        setImported(results);
        toast.success("Parse Successful", { description: `Found ${results.length} classes in ${file.name}.` });
      } else {
        toast.warning("No Classes Found", { description: "The API returned an empty timetable." });
      }
    } catch (error) {
      console.error("Upload failed", error);
      toast.error("Upload Failed", { description: "Make sure you have a valid backend API configured." });
    } finally {
      setIsParsingFile(false);
    }
  };

  const parsePDFFile = async (file: File) => {
    setIsParsingFile(true);
    try {
      toast.info("Extracting text...", { description: `Parsing PDF locally: ${file.name}` });
      const rawText = await extractTextFromPDF(file);
      const results = parseTimetable(rawText);

      if (results.length > 0) {
        setImported(results);
        setImportText(rawText); // Populate the text area so user can see what was extracted
        toast.success("Parse Successful", { description: `Found ${results.length} classes in the PDF.` });
      } else {
        toast.warning("No Classes Found", { description: "Could not parse classes from this PDF." });
      }
    } catch (err: any) {
      console.error("PDF Parse failed", err);
      toast.error("PDF Extraction Failed", { description: err.message || "Failed to extract text from PDF file." });
    } finally {
      setIsParsingFile(false);
    }
  };

  const parseImageFile = async (file: File) => {
    setIsParsingFile(true);
    try {
      toast.info("Analyzing image...", { description: `Running OCR on: ${file.name}` });
      const rawText = await extractTextFromImage(file);
      const results = parseTimetable(rawText);

      if (results.length > 0) {
        setImported(results);
        setImportText(rawText); // Populate the text area so user can review extracted output
        toast.success("OCR Successful", { description: `Found ${results.length} classes in the image.` });
      } else {
        toast.warning("No Classes Found", { description: "OCR could not identify recognizable timetable format." });
      }
    } catch (err: any) {
      console.error("Image Parse failed", err);
      toast.error("OCR Failed", { description: err.message || "Failed to extract text from image." });
    } finally {
      setIsParsingFile(false);
    }
  };

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
    // Softer, more pastel colors with distinct borders
    const colors: Record<string, string> = {
      'CS 301': 'bg-blue-50 border-blue-200 text-blue-700',
      'MATH 220': 'bg-emerald-50 border-emerald-200 text-emerald-700',
      'PHYS 201': 'bg-amber-50 border-amber-200 text-amber-700',
      'ENG 101': 'bg-purple-50 border-purple-200 text-purple-700',
      'Study Group': 'bg-pink-50 border-pink-200 text-pink-700'
    };
    return colors[course] || 'bg-slate-50 border-slate-200 text-slate-700';
  };

  // ... (helpers remain the same) ...
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
    if (minutes < 0) minutes += 24 * 60;
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

  // Removed handleUndoLastImport as it wasn't used in the UI

  const handleEmptySlotClick = (day: string, time: string) => {
    setNewClass({
      ...newClass,
      day: day,
      time: time
    });
    setIsDialogOpen(true);
  };

  const TimetableGrid: React.FC = () => (
    <div className="overflow-x-auto pb-4">
      <div className="min-w-[800px] grid grid-cols-6 gap-2">
        {/* Header */}
        <div className="p-2"></div>
        {days.map(day => (
          <div key={day} className="text-center font-bold p-3 text-sm rounded-xl bg-white/50 text-slate-600 shadow-sm border border-white/60">
            {day}
          </div>
        ))}

        {/* Time slots and classes */}
        {timeSlots.map((time, timeIndex) => (
          <React.Fragment key={time}>
            <div className="text-xs p-2 text-right text-slate-400 font-medium flex items-center justify-end">
              {time}
            </div>
            {days.map((day: string) => {
              const classesAtTime = (timetable[day] as ClassItem[] | undefined)?.filter((cls: ClassItem) => cls.time === time) || [];
              const hasClasses = classesAtTime.length > 0;

              return (
                <div
                  key={`${day}-${time}`}
                  className={`relative min-h-14 rounded-xl border border-dashed transition-all duration-200 ${!hasClasses
                    ? 'border-slate-200 hover:bg-sky-50/50 hover:border-sky-200 cursor-pointer group'
                    : 'border-transparent'
                    }`}
                  onClick={!hasClasses ? () => handleEmptySlotClick(day, time) : undefined}
                >
                  {!hasClasses && (
                    <div className="absolute inset-0 flex items-center justify-center text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xl">+</span>
                    </div>
                  )}
                  {classesAtTime.map((cls: ClassItem) => (
                    <div
                      key={cls.id}
                      className={`absolute inset-0.5 p-2 rounded-lg shadow-sm border-l-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all z-10 ${getClassColor(cls.course)}`}
                      style={{
                        height: `${cls.duration * 64 - 8}px`, // Adjusted height calculation
                      }}
                      onClick={() => setSelectedClass(cls)}
                    >
                      <div className="font-bold text-xs truncate leading-tight">{cls.course}</div>
                      <div className="text-[10px] opacity-90 truncate leading-tight mt-0.5">{cls.title}</div>
                      <div className="text-[10px] opacity-75 truncate leading-tight mt-0.5">{cls.location}</div>

                      {isEditing && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute -top-1 -right-1 w-5 h-5 p-0 text-xs rounded-full opacity-0 group-hover:opacity-100 bg-red-500 text-white shadow-sm"
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
    <div className="space-y-6">
      {days.map((day: string) => (
        <Card key={day} className="glass-card border-none shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-white/50 bg-white/30">
            <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
              <span className="text-sky-500">📅</span> {day}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 bg-white/20">
            {((timetable[day]?.length ?? 0) > 0) ? (
              <div className="space-y-3">
                {timetable[day]!.map((cls: ClassItem) => (
                  <div
                    key={cls.id}
                    className={`p-4 rounded-xl border flex justify-between items-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${getClassColor(cls.course)}`}
                    onClick={() => setSelectedClass(cls)}
                  >
                    <div>
                      <div className="font-bold text-base flex items-center gap-2">
                        {cls.course}
                        <span className="text-xs font-normal opacity-70 bg-white/50 px-2 py-0.5 rounded-full">{cls.title}</span>
                      </div>
                      <div className="text-sm opacity-80 mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1">🕒 {cls.time}</span>
                        <span className="flex items-center gap-1">📍 {cls.location}</span>
                      </div>
                      <div className="text-xs opacity-60 mt-1">{cls.academicBlock || cls.professor}</div>
                    </div>
                    {isEditing && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 border-none shadow-none"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDeleteClass(day, cls.id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 opacity-60 text-sm">No classes scheduled</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const userCourses = Array.from(new Set(
    Object.values(timetable).flat().map(c => c.course)
  ));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2 slide-up-fade" style={{ animationDelay: '0.1s' }}>
        <div>
          <h1 className="text-3xl font-bold text-gradient mb-1">My Timetable</h1>
          <p className="text-slate-500 font-medium">Manage your class schedule and study sessions</p>
        </div>
        <div className="flex w-full md:w-auto items-center justify-end gap-3">
          <Button 
            className="rounded-full bg-red-500 text-white hover:bg-red-600 font-bold shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-red-400"
            onClick={() => setSosModalOpen(true)}
          >
            🆘 Study SOS
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100/50">
                <MoreVertical className="h-5 w-5 text-slate-600" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 glass-panel border-white/60 backdrop-blur-xl">
              <DropdownMenuItem onClick={() => setIsEditing(!isEditing)} className="cursor-pointer text-slate-700 focus:text-sky-600 focus:bg-sky-50">
                <Edit className="mr-2 h-4 w-4" />
                <span>{isEditing ? 'Done Editing' : 'Edit Schedule'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsDialogOpen(true)} className="cursor-pointer text-slate-700 focus:text-sky-600 focus:bg-sky-50">
                <Plus className="mr-2 h-4 w-4" />
                <span>Add Class</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsImportOpen(true)} className="cursor-pointer text-slate-700 focus:text-sky-600 focus:bg-sky-50">
                <Upload className="mr-2 h-4 w-4" />
                <span>Import Timetable</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* SOS Modal */}
          <Dialog open={sosModalOpen} onOpenChange={setSosModalOpen}>
            <DialogContent className="glass-panel border-red-200 p-6 rounded-3xl shadow-2xl shadow-red-500/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
                  🆘 Broadcast Study SOS
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-sm text-slate-500">Need immediate help? Broadcast an SOS to friends and coursemates. (Expires in 2 hours)</p>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500">COURSE</Label>
                  <select 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" 
                    value={sosCourse} 
                    onChange={(e) => setSosCourse(e.target.value)}
                  >
                    <option value="">Select a related course...</option>
                    {userCourses.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="General">General / Not Course Specific</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500">TOPIC (Max 80 chars)</Label>
                  <Input 
                    placeholder="e.g. Need help with linked lists" 
                    maxLength={80}
                    value={sosTopic} 
                    onChange={(e) => setSosTopic(e.target.value)} 
                    className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" 
                  />
                </div>
                <Button 
                  onClick={async () => {
                    if (!sosTopic.trim() || !sosCourse) return;
                    await createSOSAlert(sosCourse, sosTopic);
                    setSosModalOpen(false);
                    setSosTopic("");
                    toast.success("SOS Broadcasted!");
                  }} 
                  className="w-full h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-lg shadow-red-200/50"
                >
                  Confirm Broadcast
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Class Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="glass-panel border-white/60 p-6 rounded-3xl shadow-2xl max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-slate-800">Add New Class</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="course" className="text-xs font-bold text-slate-500 ml-1">CODE</Label>
                    <Input id="course" placeholder="CS 301" value={newClass.course} onChange={(e) => setNewClass({ ...newClass, course: e.target.value })} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-xs font-bold text-slate-500 ml-1">TITLE</Label>
                    <Input id="title" placeholder="Data Structures" value={newClass.title} onChange={(e) => setNewClass({ ...newClass, title: e.target.value })} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="day" className="text-xs font-bold text-slate-500 ml-1">DAY</Label>
                    <select id="day" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500" value={newClass.day} onChange={(e) => setNewClass({ ...newClass, day: e.target.value })}>
                      {days.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time" className="text-xs font-bold text-slate-500 ml-1">TIME</Label>
                    <select id="time" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500" value={newClass.time} onChange={(e) => setNewClass({ ...newClass, time: e.target.value })}>
                      {timeSlots.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration" className="text-xs font-bold text-slate-500 ml-1">HOURS</Label>
                    <Input id="duration" type="number" step="0.5" min="0.5" max="4" value={newClass.duration} onChange={(e) => setNewClass({ ...newClass, duration: Number(e.target.value) })} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-xs font-bold text-slate-500 ml-1">ROOM</Label>
                    <Input id="location" placeholder="Room 101" value={newClass.location} onChange={(e) => setNewClass({ ...newClass, location: e.target.value })} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="academicBlock" className="text-xs font-bold text-slate-500 ml-1">BLOCK</Label>
                    <Input id="academicBlock" placeholder="Block A" value={newClass.academicBlock} onChange={(e) => setNewClass({ ...newClass, academicBlock: e.target.value })} className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" />
                  </div>
                </div>
                <Button onClick={handleAddClass} className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold shadow-lg shadow-sky-200/50">Add Class Project</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Import Timetable Dialog */}
          <Dialog open={isImportOpen} onOpenChange={(open) => {
            setIsImportOpen(open);
            if (!open) { setUploadFile(null); }
          }}>
            <DialogContent className="max-w-xl sm:max-w-2xl p-0 glass-panel border-white/60 overflow-hidden shadow-2xl rounded-3xl">
              <DialogHeader className="p-6 border-b border-gray-100/50 bg-white/40">
                <DialogTitle className="text-xl font-bold text-slate-800">Import Timetable</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="text" className="w-full">
                <div className="px-6 pt-4">
                  <TabsList className="grid w-full grid-cols-3 bg-slate-100/50 p-1 rounded-xl">
                    <TabsTrigger value="text" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all py-2 text-xs font-semibold">
                      <FileText className="w-4 h-4 mr-2 inline-block" /> Text
                    </TabsTrigger>
                    <TabsTrigger value="image" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all py-2 text-xs font-semibold">
                      <ImageIcon className="w-4 h-4 mr-2 inline-block" /> Image
                    </TabsTrigger>
                    <TabsTrigger value="pdf" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all py-2 text-xs font-semibold">
                      <FileUp className="w-4 h-4 mr-2 inline-block" /> PDF
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6 pt-4 space-y-4">
                  <TabsContent value="text" className="m-0 space-y-4 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                    <Label className="text-xs font-bold text-slate-500 ml-1">PASTE RAW TIMETABLE TEXT</Label>
                    <textarea
                      className="w-full min-h-[140px] p-4 border border-slate-200 rounded-xl font-mono text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      placeholder="Paste your full timetable text here..."
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                    />
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-xs text-slate-500 font-medium ml-1">{imported.length} classes found</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg" onClick={() => {
                          try {
                            const results = parseTimetable(importText);
                            setImported(results);
                          } catch (err) {
                            console.error('Import failed', err);
                          }
                        }}>Parse Text</Button>
                        {imported.length > 0 && (
                          <Button size="sm" className="h-8 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white" onClick={handleSaveImported}>
                            Save ({imported.length})
                          </Button>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="image" className="m-0 space-y-4 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <ImageIcon className="w-8 h-8 text-slate-400 mb-3" />
                      <p className="text-sm font-medium text-slate-700 mb-1">Upload Timetable Screenshot</p>
                      <p className="text-xs text-slate-500 mb-4">Select an image to parse your timetable</p>
                      <Input
                        type="file"
                        accept="image/*"
                        className="max-w-[250px] text-xs cursor-pointer"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      />
                    </div>
                    {uploadFile && (
                      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-xs text-slate-600 font-medium truncate max-w-[200px] ml-1">{uploadFile.name}</span>
                        <Button size="sm" className="h-8 text-xs rounded-lg bg-sky-500 hover:bg-sky-600 text-white" onClick={() => {
                          parseImageFile(uploadFile);
                        }} disabled={isParsingFile}>
                          {isParsingFile ? "Parsing..." : "Parse Image"}
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="pdf" className="m-0 space-y-4 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <FileUp className="w-8 h-8 text-slate-400 mb-3" />
                      <p className="text-sm font-medium text-slate-700 mb-1">Upload Timetable PDF</p>
                      <p className="text-xs text-slate-500 mb-4">Must be a readable PDF file</p>
                      <Input
                        type="file"
                        accept=".pdf"
                        className="max-w-[250px] text-xs cursor-pointer"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      />
                    </div>
                    {uploadFile && (
                      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-xs text-slate-600 font-medium truncate max-w-[200px] ml-1">{uploadFile.name}</span>
                        <Button size="sm" className="h-8 text-xs rounded-lg bg-sky-500 hover:bg-sky-600 text-white" onClick={() => {
                          parsePDFFile(uploadFile);
                        }} disabled={isParsingFile}>
                          {isParsingFile ? "Parsing..." : "Parse PDF"}
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'grid' | 'list')} className="space-y-6 slide-up-fade" style={{ animationDelay: '0.2s' }}>
        <TabsList className="bg-slate-100/50 p-1 rounded-full w-full max-w-sm mx-auto grid grid-cols-2">
          <TabsTrigger value="grid" className="rounded-full data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all py-2">Grid View</TabsTrigger>
          <TabsTrigger value="list" className="rounded-full data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all py-2">List View</TabsTrigger>
        </TabsList>
        <TabsContent value="grid">
          <Card className="glass-card border-none shadow-lg overflow-hidden">
            <CardContent className="p-6 max-h-[70vh] overflow-auto">
              <TimetableGrid />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="list">
          <div className="max-h-[70vh] overflow-auto pr-2">
            <ClassList />
          </div>
        </TabsContent>
      </Tabs>

      {/* Class Details Dialog */}
      {selectedClass && (
        <Dialog open={!!selectedClass} onOpenChange={() => setSelectedClass(null)}>
          <DialogContent className="glass-panel border-white/60 p-0 overflow-hidden shadow-2xl rounded-3xl max-w-sm">
            <div className={`h-24 ${getClassColor(selectedClass.course).split(' ')[0]} w-full`}></div>
            <div className="px-6 pb-6 -mt-10 relative">
              <div className="bg-white rounded-2xl shadow-lg p-4 border border-slate-100 mb-4 text-center">
                <h2 className="text-2xl font-bold text-slate-800">{selectedClass.course}</h2>
                <p className="text-slate-500 font-medium">{selectedClass.title}</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-xs text-slate-400 font-bold uppercase mb-1">Time</div>
                    <div className="font-semibold text-slate-700">{selectedClass.time}</div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-xs text-slate-400 font-bold uppercase mb-1">Duration</div>
                    <div className="font-semibold text-slate-700">{selectedClass.duration} hr</div>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-bold uppercase mb-1">Location</div>
                    <div className="font-semibold text-slate-700">{selectedClass.location}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 font-bold uppercase mb-1">Block</div>
                    <div className="font-semibold text-slate-700">{selectedClass.academicBlock || '-'}</div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setSelectedClass(null)} className="flex-1 rounded-xl">Close</Button>
                  <Button className="flex-1 rounded-xl bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-200/50">Find Friends</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Weekly Summary */}
      <Card className="glass-card border-none shadow-lg slide-up-fade" style={{ animationDelay: '0.3s' }}>
        <CardHeader className="pb-2 border-b border-gray-100/50">
          <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
            <span className="text-xl">📊</span> Weekly Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600">
              <div className="text-3xl mb-1 font-bold">{(Object.values(timetable).flat() as ClassItem[]).length}</div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">Classes</div>
            </div>
            <div className="p-4 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600">
              <div className="text-3xl mb-1 font-bold">{(Object.values(timetable).flat() as ClassItem[]).reduce((sum, cls) => sum + cls.duration, 0)}</div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">Hours</div>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600">
              <div className="text-3xl mb-1 font-bold">{new Set((Object.values(timetable).flat() as ClassItem[]).map(cls => cls.course)).size}</div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">Courses</div>
            </div>
            <div className="p-4 rounded-2xl bg-pink-50 border border-pink-100 text-pink-600">
              <div className="text-3xl mb-1 font-bold">{Object.values(timetable).filter(day => (day as ClassItem[]).length > 0).length}</div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">Busy Days</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
