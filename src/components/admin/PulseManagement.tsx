import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Search, 
  Trash2, 
  MapPin, 
  Clock, 
  User
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  getPulses, 
  type Pulse,
  db 
} from '../../utils/firebase/firestore';
import { doc, deleteDoc } from 'firebase/firestore';

export function PulseManagement() {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubscribe = getPulses((data) => {
      setPulses(data);
      setLoading(false);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  const handleDeletePulse = async (pulseId: string) => {
    if (window.confirm('Are you sure you want to delete this pulse?')) {
      try {
        await deleteDoc(doc(db, 'pulses', pulseId));
      } catch (error) {
        console.error('Error deleting pulse:', error);
      }
    }
  };

  const filteredPulses = pulses.filter(p => 
    (p.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.content || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            className="pl-10 bg-white border-slate-200 rounded-xl w-full" 
            placeholder="Search pulses..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredPulses.map((pulse) => (
          <Card key={pulse.id} className="border-none shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center text-sky-500">
                      <Radio size={20} className="animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 truncate flex items-center gap-2">
                        {pulse.userName} 
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-full">
                          Live Pulse
                        </span>
                      </h3>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1"><Clock size={12} /> {pulse.timestamp?.toDate().toLocaleTimeString()}</span>
                        <span className="flex items-center gap-1 text-sky-500 font-medium">{pulse.vibe?.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-slate-600 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50 mb-3 italic">
                    "{pulse.content}"
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1"><MapPin size={12} /> {pulse.locationName || 'Unknown Location'}</span>
                    <span className="flex items-center gap-1"><User size={12} /> UID: {pulse.createdBy.slice(0, 8)}...</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 sm:pt-0 sm:pl-6 sm:border-l border-slate-100">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl gap-2"
                    onClick={() => handleDeletePulse(pulse.id!)}
                  >
                    <Trash2 size={16} />
                    <span className="sm:hidden lg:inline">Delete Pulse</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredPulses.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <Radio size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No active pulses</h3>
            <p className="text-slate-500">Users are quiet right now</p>
          </div>
        )}
      </div>
    </div>
  );
}
