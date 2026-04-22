import React, { useState, useEffect, useMemo } from 'react';
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
import { MoreVertical, Plus, Upload, Edit, FileText, Image as ImageIcon, FileUp, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { extractTextFromPDF } from '../utils/pdfParser';
import { extractTextFromImage } from '../utils/imageParser';
import { parseTimetable, type ParsedClass } from '../utils/timetableParser';
import { parseFFCSTimetable, ffcsToParsedClasses, formatTimeRange, type FFCSTimetable } from '../utils/ffcsParser';
import { saveTimetable as saveUserTimetable, loadTimetable as loadUserTimetable, type ClassItem, createSOSAlert } from '../utils/firebase/firestore';
import { StudySosSheet } from './StudySosSheet';

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
  const [selectedClassDay, setSelectedClassDay] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [editingClass, setEditingClass] = useState<{ originalDay: string; id: number } | null>(null);
  const [sosSheetOpen, setSosSheetOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [importText, setImportText] = useState<string>('');
  const [imported, setImported] = useState<ParsedClass[]>([]);
  const [ffcsPreview, setFfcsPreview] = useState<FFCSTimetable>({});
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
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [now, setNow] = useState<Date>(new Date());

  // Tick every 30s to keep the "Now / Next" banner fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  /**
   * Unified parser: tries the FFCS parser first; falls back to the legacy
   * column-based parser if nothing was extracted. Returns the ParsedClass[]
   * consumed by the existing save pipeline and also updates the rich
   * FFCS preview state for UI rendering.
   */
  const parseAndPreview = (rawText: string): ParsedClass[] => {
    const tt = parseFFCSTimetable(rawText);
    const ffcsResults = ffcsToParsedClasses(tt);
    if (ffcsResults.length > 0) {
      setFfcsPreview(tt);
      return ffcsResults;
    }
    // Fallback — legacy column-based parser for non-FFCS formats
    setFfcsPreview({});
    return parseTimetable(rawText);
  };

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
      const results = parseAndPreview(rawText);

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
      const results = parseAndPreview(rawText);

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

  useEffect(() => {
    const dayIndex = new Date().getDay();
    const normalized = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
    if (days.includes(normalized)) {
      setSelectedDay(normalized);
    }
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

    resetClassForm();
    setIsDialogOpen(false);
  };

  const resetClassForm = () => {
    setNewClass({
      course: '',
      title: '',
      time: '9:00 AM',
      duration: 1,
      location: '',
      academicBlock: '',
      day: 'Monday'
    });
    setEditingClass(null);
  };

  const handleEditClass = (day: string, cls: ClassItem) => {
    setEditingClass({ originalDay: day, id: cls.id });
    setNewClass({
      course: cls.course || '',
      title: cls.title || '',
      time: cls.time || '9:00 AM',
      duration: Number(cls.duration) || 1,
      location: cls.location || '',
      academicBlock: cls.academicBlock || '',
      day: day,
    });
    setSelectedClass(null);
    setIsDialogOpen(true);
  };

  const handleUpdateClass = async () => {
    if (!editingClass) return;
    const { originalDay, id } = editingClass;
    const updatedClass: ClassItem = {
      id,
      course: newClass.course,
      title: newClass.title,
      time: newClass.time,
      duration: Number(newClass.duration),
      location: newClass.location,
      academicBlock: newClass.academicBlock,
    };

    const updatedTimetable: Record<string, ClassItem[]> = { ...timetable };
    // Remove from original day
    updatedTimetable[originalDay] = (updatedTimetable[originalDay] || []).filter(
      (c) => c.id !== id
    );
    // Add to new day (which may be same as original)
    const targetDay = newClass.day;
    updatedTimetable[targetDay] = [...(updatedTimetable[targetDay] || []), updatedClass];

    setTimetable(updatedTimetable);
    await saveTimetable(updatedTimetable);
    toast.success('Class updated', { description: `${updatedClass.course || 'Class'} saved to ${targetDay}.` });

    resetClassForm();
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

  /**
   * Parse any class-time string into minutes-since-midnight.
   * Supports "9:00 AM", "03:51 PM", "15:51", "3:51PM" etc.
   * Returns 24*60 (end-of-day) for unparseable values so they sort last.
   */
  const parseTimeToMinutes = (t?: string): number => {
    if (!t) return 24 * 60;
    const s = t.trim().toUpperCase();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!m) return 24 * 60;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3];
    if (ampm === 'AM') {
      if (h === 12) h = 0;
    } else if (ampm === 'PM') {
      if (h !== 12) h += 12;
    }
    return h * 60 + min;
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
      const niceTitle = it.courseName
        ? `${it.courseName}${it.rawType ? ` – ${it.rawType}` : ''}${it.slots && it.slots.length > 1 ? ` (${it.slots.join('+')})` : ''}`
        : it.classType;
      const entry: ClassItem = {
        id: Date.now() + Math.floor(Math.random() * 100000),
        course: it.courseCode,
        title: niceTitle,
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
                      onClick={() => {
                        if (isEditing) {
                          handleEditClass(day, cls);
                        } else {
                          setSelectedClass(cls);
                          setSelectedClassDay(day);
                        }
                      }}
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
                    onClick={() => {
                      setSelectedClass(cls);
                      setSelectedClassDay(day);
                    }}
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
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="h-8 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 border-none shadow-none"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleEditClass(day, cls);
                          }}
                          data-testid={`edit-class-list-${cls.id}`}
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 border-none shadow-none"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDeleteClass(day, cls.id);
                          }}
                          data-testid={`delete-class-list-${cls.id}`}
                        >
                          Delete
                        </Button>
                      </div>
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

  const selectedDayClasses = [...(timetable[selectedDay] || [])].sort(
    (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
  );

  // -------------------------------------------------------------------------
  // Live "Now / Next" banner — computed from today's real classes
  // -------------------------------------------------------------------------
  const { ongoingClass, nextClass, todayName } = useMemo(() => {
    const dayIndex = now.getDay();
    const dayNameMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayFull = dayNameMap[dayIndex];
    const todaysClasses = [...((timetable[todayFull] as ClassItem[] | undefined) || [])].sort(
      (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
    );
    const minutesNow = now.getHours() * 60 + now.getMinutes();

    let ongoing: ClassItem | null = null;
    let upNext: ClassItem | null = null;

    for (const c of todaysClasses) {
      const start = parseTimeToMinutes(c.time);
      const end = start + Math.round((Number(c.duration) || 1) * 60);
      if (minutesNow >= start && minutesNow < end) {
        ongoing = c;
      } else if (start > minutesNow && !upNext) {
        upNext = c;
      }
    }
    return { ongoingClass: ongoing, nextClass: upNext, todayName: todayFull };
  }, [timetable, now]);

  const formatClassTimeRange = (cls: ClassItem): string => {
    const startMin = parseTimeToMinutes(cls.time);
    const endMin = startMin + Math.round((Number(cls.duration) || 1) * 60);
    const fmt = (m: number) => {
      const h24 = Math.floor(m / 60);
      const mm = m % 60;
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      let h = h24 % 12;
      if (h === 0) h = 12;
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
    };
    return `${fmt(startMin)} – ${fmt(endMin)}`;
  };

  const minutesUntilNext = (cls: ClassItem): number => {
    return parseTimeToMinutes(cls.time) - (now.getHours() * 60 + now.getMinutes());
  };

  const weekDates = useMemo(() => {
    const now = new Date();
    const dayIndex = now.getDay();
    const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

    return days.map((day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        day,
        short: day.slice(0, 3).toUpperCase(),
        dateNumber: date.getDate(),
      };
    });
  }, []);

  const getSessionVariant = (cls: ClassItem) => {
    const source = `${cls.title} ${cls.course}`.toLowerCase();
    if (source.includes('lab') || source.includes('workshop')) {
      return {
        label: 'Lab',
        chip: 'bg-slate-300 text-slate-700',
        activeDot: 'bg-slate-400',
        card: 'bg-slate-100/80',
      };
    }
    if (source.includes('seminar')) {
      return {
        label: 'Seminar',
        chip: 'bg-indigo-200 text-indigo-900',
        activeDot: 'bg-sky-400/40',
        card: 'bg-gradient-to-b from-white to-slate-50',
      };
    }
    return {
      label: 'Lecture',
      chip: 'bg-blue-200 text-sky-900',
      activeDot: 'bg-sky-800',
      card: 'bg-white',
    };
  };

  const getCourseBubbles = (cls: ClassItem) => {
    const seed = (cls.course || 'UNI').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
    return [seed, `${seed[0] || 'U'}${seed[1] || 'N'}`, `${seed[0] || 'U'}${seed[2] || 'I'}`];
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-32">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-10 px-6 pb-32 pt-24">
        <div className="w-full max-w-md space-y-1">
          <div className="text-xs font-bold uppercase leading-4 tracking-wide text-sky-800">Academic Journey</div>
          <h1 className="font-['Plus_Jakarta_Sans'] text-4xl font-extrabold leading-10 text-gray-800">Your Schedule.</h1>
          <div className="max-w-72 pt-1 text-base leading-6 text-zinc-600">
            Curating your intellectual growth,
            <br />
            one session at a time.
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Live Now / Next Banner                                             */}
        {/* ------------------------------------------------------------------ */}
        {(ongoingClass || nextClass) && (
          <div className="w-full max-w-2xl" data-testid="now-next-banner">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* NOW card */}
              <div
                className={`relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_8px_30px_-6px_rgba(2,132,199,0.45)] ${
                  ongoingClass
                    ? 'bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500'
                    : 'bg-gradient-to-br from-slate-300 to-slate-200 text-slate-500'
                }`}
                data-testid="now-card"
              >
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-90">
                  <span className={`inline-block h-2 w-2 rounded-full ${ongoingClass ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
                  Happening now · {todayName}
                </div>
                {ongoingClass ? (
                  <div className="mt-3 space-y-1">
                    <div className="text-xl font-extrabold leading-7" data-testid="now-course">
                      {ongoingClass.course || ongoingClass.title}
                    </div>
                    <div className="text-sm opacity-90" data-testid="now-title">
                      {ongoingClass.title && ongoingClass.title !== ongoingClass.course ? ongoingClass.title : ''}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-3 text-xs">
                      <span className="rounded-full bg-white/20 px-3 py-1 font-semibold backdrop-blur-sm">
                        {formatClassTimeRange(ongoingClass)}
                      </span>
                      {ongoingClass.location && (
                        <span className="inline-flex items-center gap-1 opacity-90">
                          <MapPin className="h-3 w-3" /> {ongoingClass.location}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm font-medium">
                    No class in progress — enjoy the break.
                  </div>
                )}
              </div>

              {/* NEXT card */}
              <div
                className={`relative overflow-hidden rounded-3xl border p-5 shadow-[0_8px_30px_-6px_rgba(2,132,199,0.15)] ${
                  nextClass ? 'border-sky-200 bg-white' : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
                data-testid="next-card"
              >
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                  Up next
                </div>
                {nextClass ? (
                  <div className="mt-3 space-y-1">
                    <div className="text-xl font-extrabold leading-7 text-gray-800" data-testid="next-course">
                      {nextClass.course || nextClass.title}
                    </div>
                    <div className="text-sm text-zinc-600" data-testid="next-title">
                      {nextClass.title && nextClass.title !== nextClass.course ? nextClass.title : ''}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-3 text-xs text-zinc-700">
                      <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-700">
                        in {minutesUntilNext(nextClass) >= 60
                          ? `${Math.floor(minutesUntilNext(nextClass) / 60)}h ${minutesUntilNext(nextClass) % 60}m`
                          : `${minutesUntilNext(nextClass)}m`}
                      </span>
                      <span className="text-zinc-500">{formatClassTimeRange(nextClass)}</span>
                      {nextClass.location && (
                        <span className="inline-flex items-center gap-1 text-zinc-500">
                          <MapPin className="h-3 w-3" /> {nextClass.location}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm font-medium">
                    {ongoingClass ? 'Last class of the day.' : 'Nothing scheduled — you\'re all done!'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-md">
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {weekDates.map((item: { day: string; short: string; dateNumber: number }) => {
              const active = selectedDay === item.day;
              return (
                <button
                  key={item.day}
                  type="button"
                  onClick={() => setSelectedDay(item.day)}
                  className={`relative flex h-24 min-w-16 flex-col items-center justify-center rounded-full px-5 transition-all ${
                    active
                      ? 'bg-sky-400 text-cyan-950 shadow-[0_10px_15px_-3px_rgba(0,98,134,0.10),0_4px_6px_-4px_rgba(0,98,134,0.10)]'
                      : 'bg-white text-zinc-600'
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase leading-4 ${active ? 'opacity-70' : 'opacity-60'}`}>{item.short}</span>
                  <span className="text-xl font-extrabold leading-7">{item.dateNumber}</span>
                  {active && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-950" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-full max-w-2xl">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-600">
              {loading ? 'Loading timetable...' : `${selectedDayClasses.length} session${selectedDayClasses.length === 1 ? '' : 's'} planned for ${selectedDay}`}
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="rounded-full bg-red-500 text-white hover:bg-red-600 font-bold shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-red-400"
                onClick={() => setSosSheetOpen(true)}
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
          {/* Study SOS Sheet */}
          <StudySosSheet 
            open={sosSheetOpen} 
            onOpenChange={setSosSheetOpen} 
            userTimetable={timetable}
          />

          {/* Add Class Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetClassForm();
          }}>
            <DialogContent className="glass-panel border-white/60 p-6 rounded-3xl shadow-2xl max-w-lg" data-testid="class-form-dialog">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-slate-800">
                  {editingClass ? 'Edit Class' : 'Add New Class'}
                </DialogTitle>
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
                <Button
                  onClick={editingClass ? handleUpdateClass : handleAddClass}
                  className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold shadow-lg shadow-sky-200/50"
                  data-testid="class-form-submit-btn"
                >
                  {editingClass ? 'Save Changes' : 'Add Class Project'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Import Timetable Dialog */}
          <Dialog open={isImportOpen} onOpenChange={(open) => {
            setIsImportOpen(open);
            if (!open) { setUploadFile(null); setFfcsPreview({}); }
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
                            const results = parseAndPreview(importText);
                            setImported(results);
                            if (results.length > 0) {
                              toast.success('Parsed', { description: `${results.length} class${results.length === 1 ? '' : 'es'} detected (merged where contiguous).` });
                            } else {
                              toast.warning('No classes found', { description: 'Could not detect any valid slot cells.' });
                            }
                          } catch (err) {
                            console.error('Import failed', err);
                          }
                        }} data-testid="parse-text-btn">Parse Text</Button>
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

              {/* FFCS Parsed Preview — shared across all tabs */}
              {Object.keys(ffcsPreview).length > 0 && (
                <div className="px-6 pb-6" data-testid="ffcs-preview-panel">
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wide text-sky-700">
                        Parsed Timetable Preview
                      </div>
                      <Badge className="bg-sky-500 text-white border-none">
                        {Object.values(ffcsPreview).reduce((n, a) => n + (a?.length || 0), 0)} events
                      </Badge>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                      {(['MON','TUE','WED','THU','FRI','SAT','SUN'] as const).map((d) => {
                        const events = ffcsPreview[d] || [];
                        if (events.length === 0) return null;
                        return (
                          <div key={d} data-testid={`ffcs-day-${d}`}>
                            <div className="mb-1 text-[11px] font-bold uppercase text-slate-500">{d}</div>
                            <div className="space-y-1.5">
                              {events.map((ev, idx) => (
                                <div
                                  key={`${d}-${idx}`}
                                  className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs shadow-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-800 truncate">
                                      {ev.courseName || ev.courseCode}
                                      <span className="ml-1 text-slate-400 font-normal">· {ev.type}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                      {formatTimeRange(ev.startTime, ev.endTime)} · {ev.room} · {ev.slots.join('+')}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {ev.kind}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
            </div>
          </div>

          <div className="relative pt-2">
            <div className="absolute left-3 top-2 h-[calc(100%-1rem)] w-0.5 rounded-full bg-gradient-to-b from-sky-400 to-sky-400/10 opacity-30" />
            <div className="space-y-12">
              {loading ? (
                <div className="pl-10 text-sm text-zinc-600">Loading your academic journey...</div>
              ) : selectedDayClasses.length === 0 ? (
                <div className="pl-10">
                  <div className="rounded-[32px] bg-white p-6 shadow-[0px_8px_30px_0px_rgba(0,0,0,0.02)]">
                    <div className="text-xl font-bold text-gray-800">No classes scheduled</div>
                    <div className="mt-2 text-sm text-zinc-600">Use the menu to add a class or import your timetable for {selectedDay}.</div>
                  </div>
                </div>
              ) : (
                selectedDayClasses.map((cls, index) => {
                  const variant = getSessionVariant(cls);
                  const bubbles = getCourseBubbles(cls);
                  return (
                    <div key={cls.id} className={`relative pl-10 ${index === selectedDayClasses.length - 1 ? 'pb-2' : ''}`}>
                      <div className="absolute left-0 top-[6px] inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
                        <div className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-sky-800' : variant.activeDot}`} />
                      </div>
                      <div className={`space-y-3 ${index > 1 ? 'opacity-70' : ''}`}>
                        <div className="inline-flex w-full items-center justify-between">
                          <div className={`text-xs font-bold leading-4 tracking-tight ${index === 0 ? 'text-sky-800' : 'text-zinc-600/70'}`}>
                            {cls.time}
                          </div>
                          <div className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase leading-4 ${variant.chip}`}>
                            {variant.label}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              handleEditClass(selectedDay, cls);
                            } else {
                              setSelectedClass(cls);
                              setSelectedClassDay(selectedDay);
                            }
                          }}
                          className={`w-full rounded-[32px] p-6 text-left shadow-[0px_8px_30px_0px_rgba(0,0,0,0.02)] outline outline-1 outline-white/50 ${variant.card}`}
                          data-testid={`timeline-class-${cls.id}`}
                        >
                          <div className="space-y-2">
                            <div className="text-xl font-bold leading-7 text-gray-800">{cls.course || cls.title}</div>
                            <div className="inline-flex items-center gap-2 text-sm leading-5 text-zinc-600">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{cls.location || cls.academicBlock || 'Location TBA'}</span>
                            </div>
                            {cls.title && cls.course !== cls.title && (
                              <div className="text-sm text-zinc-500">{cls.title}</div>
                            )}
                          </div>

                          <div className="pt-4 inline-flex w-full items-center justify-between">
                            <div className="flex items-center">
                              {bubbles.map((bubble, bubbleIndex) => (
                                <div
                                  key={`${cls.id}-${bubble}-${bubbleIndex}`}
                                  className={`-ml-2 first:ml-0 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-sky-100 text-[10px] font-bold text-sky-700`}
                                >
                                  {bubble}
                                </div>
                              ))}
                              <div className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-zinc-200 text-[10px] font-bold text-zinc-600">
                                +{Math.max(2, Math.round((cls.duration || 1) * 4))}
                              </div>
                            </div>

                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky-800 text-white shadow-[0px_4px_6px_-1px_rgba(0,98,134,0.20),0px_2px_4px_-2px_rgba(0,98,134,0.20)]">
                              {isEditing ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteClass(selectedDay, cls.id);
                                  }}
                                  className="text-xs font-bold"
                                >
                                  ×
                                </button>
                              ) : (
                                <Plus className="h-4 w-4 rotate-45" />
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Class Details Dialog */}
      {selectedClass && (
        <Dialog open={!!selectedClass} onOpenChange={() => {
          setSelectedClass(null);
          setSelectedClassDay(null);
        }}>
          <DialogContent className="glass-panel border-white/60 p-0 overflow-hidden shadow-2xl rounded-3xl max-w-sm" data-testid="class-details-dialog">
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
                  <Button
                    variant="ghost"
                    onClick={() => { setSelectedClass(null); setSelectedClassDay(null); }}
                    className="flex-1 rounded-xl"
                    data-testid="class-details-close-btn"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedClass && selectedClassDay) {
                        handleEditClass(selectedClassDay, selectedClass);
                      }
                    }}
                    className="flex-1 rounded-xl bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-200/50"
                    data-testid="class-details-edit-btn"
                  >
                    <Edit className="h-4 w-4 mr-1.5" /> Edit Class
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Weekly Summary */}
      <Card className="mx-auto hidden max-w-2xl glass-card border-none shadow-lg slide-up-fade md:block" style={{ animationDelay: '0.3s' }}>
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
